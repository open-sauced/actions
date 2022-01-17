import { App } from 'octokit'
import { createClient } from '@supabase/supabase-js'
import { writeFile } from 'fs/promises'

import api from './lib/persistedGraphQL.js'
import fetchContributorNames from './lib/contributorNameHelper.js'
import cron from './cron.json'

const anon_key = process.env.SUPABASE_ANON_KEY
const supabaseUrl = process.env.SUPABASE_URL
const limitDays = parseInt(process.env.LIMIT_DAYS) || 7
let limitUsers = parseInt(process.env.LIMIT_USERS) || 3
const {checked} = cron
const lastExecuted = new Date()
const parsedCache = {}
const promises = []

for (const item in checked) {
  const date = new Date(checked[item].lastExecuted)
  const diff = lastExecuted - date
  parsedCache[item] = {
    ...checked[item],
    offsetDays: Number(diff / 1000 / 60 / 60 / 24).toFixed(0)
  }
}

// Create a single supabase client for interacting with your database
const supabase = createClient(supabaseUrl, anon_key)

async function run() {
  const app = new App({
    appId: +process.env.OPEN_SAUCED_APP_ID,
    privateKey: process.env.OPEN_SAUCED_PRIVATE_KEY,
  })

  // iterate over all installation repos. Leveraging the installation token
  // allows us to make changes across all installed repos
  for await (const { octokit, repository } of app.eachRepository.iterator()) {
    if (repository.name !== "open-sauced-goals") {
      continue
    }

    if ((parsedCache[repository.owner.login] !== undefined
        && parsedCache[repository.owner.login].offsetDays < limitDays)) {
      continue
    }

    if (promises.length >= limitUsers) {
      break
    }

    promises.push(new Promise(async (resolve, reject) => {
      try {
        console.log(`Processing ${repository.full_name}`)

        const {data} = await octokit.rest.repos.getContent({
          owner: repository.owner.login,
          repo: repository.name,
          path: "stars.json"
        }).catch((err) => {
          console.log(`stars.json: ${err}`)
          return {data: {content: btoa("[]")}}
        })

        // convert from base64 to parseable JSON
        const content = Buffer.from(data.content, "base64").toString()
        const parsedData = JSON.parse(content);

        // update data with repo id
        for (const item of parsedData) {
          const [owner, repo] = item.full_name.split("/")
          const currentRepoResponse = await octokit.rest.repos.get({owner, repo})
          const {
            id,
            stargazers_count,
            description,
            open_issues,
          } = currentRepoResponse.data

          const {data, errors} = await api.persistedRepoDataFetch({owner: owner, repo: repo})

          if (errors && errors.length > 0) {
            continue
          }

          const {contributors_oneGraph} = data.gitHub.repositoryOwner.repository;

          const contributorNames = await fetchContributorNames(contributors_oneGraph.nodes)

          item.id = id

          await supabase.from('user_stars').insert({
            user_id: repository.owner.id,
            star_id: item.id,
            repo_name: item.full_name,
            recency_score: parsedData.indexOf(item),
            description: description,
            issues: open_issues,
            stars: stargazers_count,
            contributors: contributorNames.slice(0,2) // grab first two names only
          })
        }

        // send parsedData to stars table
        await supabase.from('stars').upsert(parsedData)

        console.log(`ADDED STARS FROM: ${repository.html_url}`)

        // // send parsedData to supabase
        supabase
            .from('users')
            .upsert({id: repository.owner.id, login: repository.owner.login})

        checked[repository.owner.login] = {
          owner: repository.owner.login,
          lastExecuted,
        }

        resolve(checked[repository.owner.login]);
      } catch (err) {
        console.log(`ERROR: ${err}`)
        console.log(`SKIPPED: ${repository.html_url}`)
        reject(err);
      }
    }));
  }

  await Promise.all(promises);

  // write to file and commit block
  await writeFile('./populate-the-supabase/cron.json', JSON.stringify({
    lastExecuted,
    checked
  }, null, 2))
}

run()
