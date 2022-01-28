import { App } from 'octokit'
import { writeFile } from 'node:fs/promises'

import { supabase } from './lib/supabase.js'
import api from './lib/persistedGraphQL.js'
import fetchContributorNames from './lib/contributorNameHelper.js'
import consoleHeader from './lib/consoleHeader.js'
import cron from './cron.json'

const limitDays = parseInt(process.env.LIMIT_DAYS) || 1
let limitUsers = parseInt(process.env.LIMIT_USERS) || 5
const checked = {...cron.checked}
const lastExecuted = new Date()
const parsedCache = {}
const parseInstallations = []
const parseData = []

consoleHeader(' OPEN |SAUCED', {
  font: 'block',
})
console.log(`Started execution at ${lastExecuted}`)

for (const item in checked) {
  const date = new Date(checked[item].lastExecuted)
  const diff = lastExecuted - date

  // generate a cache of items with offset dates
  parsedCache[item] = {
    ...checked[item],
    offsetDays: Number(diff / 1000 / 60 / 60 / 24).toFixed(0)
  }
}

async function run() {
  const app = new App({
    appId: +process.env.OPEN_SAUCED_APP_ID,
    privateKey: process.env.OPEN_SAUCED_PRIVATE_KEY,
  })

  consoleHeader('Parsing installations')
  for await (const {installation} of app.eachInstallation.iterator()) {
    if (installation.account.login === 'open-sauced') {
      continue
    }

    console.log(`Fetching data for installation ${installation.account.login}`)
    // we don't have a local commit log of checking these installations
    if (typeof parsedCache[installation.account.login] === 'undefined') {
      console.log(`${installation.account.login} is not in our cache, adding to the queue`)
      parseInstallations.push(installation)
    } else {
      // we have a local cache of this installation
      let parsed = false

      if (
        parsedCache[installation.account.login].offsetDays >= limitDays
      ) {
        parseInstallations.push(installation)
        parsed = true
      }

      console.log(`${installation.account.login} has been checked ${
        parsedCache[installation.account.login].offsetDays} days ago, ${parsed ? 'adding to the queue' : 'skipping'}`)
    }
  }

  for await (const installation of parseInstallations) {
    if (parseData.length >= limitUsers) {
      break
    }

    console.log(`Fetching stars data for user ${installation.account.login}`)

    // check if we have access to open-sauced-goals repo and fail safe exit if not
    const installationExists = await app.octokit.rest.apps
      .getRepoInstallation({
        owner: installation.account.login,
        repo: 'open-sauced-goals',
      })
      .then(() => true)
      .catch((response) => {
        if (response.status === 404) {
          console.log(`${installation.account.login} is missing open-sauced-goals repo, flagging to skip`)
          checked[installation.account.login] = {
            owner: installation.account.login,
            notFound: true,
            lastExecuted,
          }
        } else {
          console.log(`Error getting repo installation for ${installation.account.login}`, response.toString())
        }

        return false
      })

    // if installation exists we proceed towards parsing
    if (installationExists) {
      const octokit = await app.getInstallationOctokit(installation.id)

      const {data: repository} = await octokit.rest.repos.get({
        owner: installation.account.login,
        repo: 'open-sauced-goals',
      }).catch((err) => {
        console.log(`${installation.account.login} open-sauced-goals: ${err}`)
        return {data: null}
      })

      const {data} = await octokit.rest.repos.getContent({
        owner: installation.account.login,
        repo: 'open-sauced-goals',
        path: 'stars.json'
      }).catch((err) => {
        console.log(`${installation.account.login} stars.json: ${err}`)
        return {data: {content: btoa("[]")}}
      })

      // convert from base64 to parseable JSON
      const content = Buffer.from(data.content, "base64").toString()
      const parsedData = JSON.parse(content)
      const starsData = data.content.length > 0

      parseData.push({
        installation,
        parsedData,
        starsData,
        repository,
      })
    }
  }

  consoleHeader('Parsing stars')
  console.log(`Existing installation queue was ${parseInstallations.length}`)
  console.log(`Attempting to parse ${parseData.length} users out of ${limitUsers} process.env.LIMIT_USERS`)

  await Promise.all(
    parseData.map(async ({installation, parsedData, starsData, repository}) =>
      new Promise(async (resolve, reject) => {
        try {
          console.log(`Processing installation #${installation.id}, ${installation.account.login} stars.json`)
          const octokit = await app.getInstallationOctokit(installation.id)

          // update data with repo id
          for await (const item of parsedData) {
            const [owner, repo] = item.full_name.split("/")
            const currentRepoResponse = await octokit.rest.repos.get({owner, repo})
              .catch((err) => {
                return {errors: [err]}
              })

            if (currentRepoResponse.errors && currentRepoResponse.errors.length > 0) {
              console.log(`ERROR for ${owner}/${repo}`, currentRepoResponse.errors)
              // reject(currentRepoResponse.errors)
              continue
            }

            const {
              id,
              stargazers_count,
              description,
              open_issues,
            } = currentRepoResponse.data

            const {data, errors} = await api.persistedRepoDataFetch({owner, repo})

            if (errors && errors.length > 0) {
              console.log(`ERROR for ${owner}/${repo}`, errors)
              // reject(errors)
              continue
            }

            if (
              data.gitHub.repositoryOwner === null
              || typeof data.gitHub.repositoryOwner.repository !== "object"
            ) {
              console.log(`ERROR for ${owner}/${repo}`, "No owner")
              // reject("No owner")
              continue
            }

            const {contributors_oneGraph} = data.gitHub.repositoryOwner.repository

            const contributorNames = await fetchContributorNames(contributors_oneGraph.nodes)

            item.id = id

            const userStars = {
              id: repository.id,
              user_id: installation.account.id,
              star_id: item.id,
              repo_name: item.full_name,
              recency_score: parsedData.indexOf(item),
              description: description,
              issues: open_issues,
              stars: stargazers_count,
              contributors: contributorNames.slice(0,2) // grab first two names only
            }

            await supabase
              .from('user_stars')
              .insert(userStars)
          }

          // send parsedData to stars table
          await supabase
            .from('stars')
            .upsert(parsedData, {
              onConflict: "id"
            })

          console.log(`ADDED STARS FROM: ${installation.account.login}`)

          // send parsedData to supabase
          supabase
            .from('users')
            .upsert({
              id: installation.account.id,
              stars_data: starsData,
              open_issues: repository.open_issues_count,
              private: repository.private,
            }, {
              onConflict: "id"
            })

          checked[installation.account.login] = {
            owner: installation.account.login,
            notFound: false,
            lastExecuted,
          }

          resolve(checked[installation.account.login])
        } catch (err) {
          console.log(`UNEXPECTED ERROR: ${err}`)
          console.log(`SKIPPED: ${installation.account.login}`)
          reject(err)
        }
      })
    )
  )

  // check whether we have new data to cache
  consoleHeader('Versioning changes')
  if (parseData.length > 0) {
    console.log('cron.json cached users: ', Object.keys(cron.checked).length)
    console.log('cron.json parsed users: ', parseData.length)

    // write to file and commit block
    await writeFile('./src/cron.json', JSON.stringify({
      lastExecuted,
      checked
    }, null, 2))
    console.log('Wrote changes to cron.json, make sure to commit this file')
  } else {
    console.log('Nothing to commit to cron.json')
  }

  consoleHeader('Finished')
}

await run()
