import { App } from "octokit"
import dotenv from "dotenv"
import { createClient } from '@supabase/supabase-js'
import api from "./lib/persistedGraphQL.js";
import fetchContributorNames from "./lib/contributorNameHelper.js";

dotenv.config()

const anon_key = process.env.SUPABASE_ANON_KEY
const supabaseUrl = process.env.SUPABASE_URL

// Create a single supabase client for interacting with your database
const supabase = createClient(supabaseUrl, anon_key)

async function run() {
  const app = new App({
    appId: +process.env.OPEN_SAUCED_APP_ID,
    privateKey: process.env.OPEN_SAUCED_PRIVATE_KEY,
  })

  // iterate over all installation repos. Leveraging the installation token
  // allows us to make changes across all installed repos
  await app.eachRepository( async ({repository, octokit}) => {
    // checkout only goal repos
    if (repository.name !== "open-sauced-goals") {
      return
    }

    try {
      const {data} = await octokit.rest.repos.getContent({
        owner: repository.owner.login,
        repo: repository.name,
        path: "stars.json"
      }).catch((err) => {
        console.log(`stars.json: ${err}`)
        return {data: {content: []}}
      });

      // convert from base64 to parseable JSON
      const content = Buffer.from(data.content, "base64").toString()
      const parsedData = JSON.parse(content)
      const starsData = data.content.length > 0

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

        const persistedData = await api.persistedRepoDataFetch({owner: owner, repo: repo})
        const {contributors_oneGraph} = persistedData.data.gitHub.repositoryOwner.repository;

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

      console.log(`ADDED STARS FROM: ${repository.html_url}`)

      // send parsedData to supabase
     await supabase.from('users')
      .upsert({id: repository.owner.id, stars_data: starsData,
        open_issues: repository.open_issues, private: repository.private}, {
          onConflict:
          'id'
        })

      console.log(`ADDED USER FROM: ${repository.owner.login}`)

    } catch (err) {
      console.log(`SKIPPED: ${repository.html_url}`)
      return
    }
  });
}

run()
