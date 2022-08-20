import consoleHeader from './lib/consoleHeader.js'
import cron from './cron.json' assert { type: 'json' }
import {App} from "octokit";
import {p} from "@antfu/utils";
import {supabase} from "./lib/supabase.js";
import {writeFile} from "node:fs/promises";

const limitDays = parseInt(process.env.LIMIT_DAYS) || 1
let limitUsers = parseInt(process.env.LIMIT_USERS) || 5
const checked = {...cron.checked}
const lastExecuted = new Date()

const cache = {
  users: {},
  repos: {},
  stars: {},
  contributions: {},
}
const que = {
  users: [],
  installations: [],
  repos: [],
  contributions: [],
}

consoleHeader(' OPEN |SAUCED', {
  font: 'block',
})
console.log(`Started execution at ${lastExecuted}`)

for (const item in checked) {
  const date = new Date(checked[item].lastExecuted)
  const diff = lastExecuted - date

  // generate a cache of items with offset dates
  cache.users[item] = {
    ...checked[item],
    offsetDays: Number(diff / 1000 / 60 / 60 / 24).toFixed(0)
  }
}

async function run() {
  const app = new App({
    appId: +process.env.OPEN_SAUCED_APP_ID,
    privateKey: process.env.OPEN_SAUCED_PRIVATE_KEY,
  })

  consoleHeader('Parsing cron')
  for await (const {installation} of app.eachInstallation.iterator()) {
    if (installation.account.login === 'open-sauced') {
      continue
    }

    if (installation.suspended_at) {
      console.log(`${installation.account.login} has been suspended`)
      continue
    }

    // we don't have a local commit log of checking these installations
    if (typeof cache.users[installation.account.login] === 'undefined') {
      console.log(`${installation.account.login} is not in our cache, adding to the queue`)
      que.users.push(installation)
    } else {
      // we have a local cache of this installation
      let parsed = false

      if (
        cache.users[installation.account.login].offsetDays >= limitDays
      ) {
        que.users.push(installation)
        parsed = true
      }

      console.log(`${installation.account.login} has been checked ${
        cache.users[installation.account.login].offsetDays} days ago, ${parsed ? 'adding to the queue' : 'skipping'}`)
    }
  }

  consoleHeader('Parsing users')
  for await (const installation of que.users) {
    if (que.installations.length >= limitUsers) {
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

      const {data: {
        open_issues,
        private: isPrivate,
      }} = await octokit.rest.repos.get({
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
      const starsRepos = JSON.parse(content)
      const starsJsonExists = data.content.length > 0

      starsRepos.map(repo => que.repos.push({
        ...repo,
        installationId: installation.id
      }))

      const {data: [dbUser], error} = await supabase
        .from('users')
        .upsert({
          id: installation.account.id,
          open_issues,
          is_private: isPrivate,
          is_open_sauced_member: true,
          has_stars_data: starsJsonExists,
          login: installation.account.login,
        }, {
          onConflict: 'id',
        })

      error && console.log(`Unable to insert supabase user with id #${installation.account.id}`, error);

      if (starsJsonExists && !error) {
        que.installations.push({
          starsRepos,
          dbUser,
        })

        checked[installation.account.login] = {
          owner: installation.account.login,
          notFound: false,
          lastExecuted,
        }
      }
    }
  }

  consoleHeader('Parsing repos')
  await p(que.repos)
    .map(async (namedRepo) => {
      const [owner, repo] = namedRepo.full_name.split("/")
      const octokit = await app.getInstallationOctokit(namedRepo.installationId)

      // const currentRepoResponse = await octokit.rest.repos.get({user, repo})
      const {data: fetchedRepo, errors} = await octokit.rest.repos.get({owner, repo})
        .catch((err) => {
          return {errors: [err]}
        })

      if (errors && errors.length > 0) {
        console.log(`ERROR for ${owner}/${repo}`, errors)
        // reject(currentRepoResponse.errors)
        return errors
      }

      // insert into db
      const repository = {
        id: fetchedRepo.id,
        user_id: fetchedRepo.owner.id,
        full_name: namedRepo.full_name,
        name: repo,
        language: fetchedRepo.language,
        description: fetchedRepo.description,
        url: fetchedRepo.homepage,
        issues: fetchedRepo.open_issues,
        stars: fetchedRepo.stargazers_count,
        watchers: fetchedRepo.watchers_count,
        subscribers: fetchedRepo.subscribers_count,
        license: fetchedRepo.license ? fetchedRepo.license.spdx_id : `UNLICENSED`,
        is_fork: !!fetchedRepo.fork,
        created_at: fetchedRepo.created_at,
        updated_at: fetchedRepo.updated_at,
        pushed_at: fetchedRepo.pushed_at,
      }

      const {data: [dbRepository], error} = await supabase
        .from('repos')
        .upsert(repository, {
          onConflict: "id"
        })

      !error && (cache.repos[namedRepo.full_name] = dbRepository);
    })


  consoleHeader('Parsing stars')
  console.log(`Existing cron queue was ${que.users.length}`)
  console.log(`Attempting to parse ${que.installations.length} users out of ${limitUsers} env.LIMIT_USERS`)

  await p(que.installations)
    .map(async ({
      starsRepos,
      dbUser: {
        id: user_id,
        login,
      },
    }) => {
      console.log(`Processing user ${login} stars.json data`)

      // const {error, data, count} = await supabase
      // delete all previous associations (if any)
      await supabase
        .from('users_to_repos_stars')
        .delete({
          returning: true,
          count: true,
        })
        .match({
          user_id,
        })

      for await (const item of starsRepos) {
        const repo = cache.repos[item.full_name];

        if (!repo) {
          console.log(`Repo ${item.full_name} not found in cache`)
          continue
        }

        const { data: [starExists], error: starExistsError } = await supabase
          .from("users_to_repos_stars")
          .select(`*`)
          .eq("user_id", user_id)
          .eq("repo_id", repo.id);

        if (starExistsError) {
          console.log(`Error getting existing stars for ${user_id}/${repo.id}`, starExistsError)
          continue
        }

        if (starExists) {
          console.log(`Skipping ${user_id}/${repo.id} because stars for it already exist`)
          continue
        }

        const {data: [starInsert], error: starInsertError} = await supabase
          .from("users_to_repos_stars")
          .insert({
            user_id,
            repo_id: repo.id,
          });

        if (starInsertError) {
          console.log(`Error inserting stars for ${user_id}/${repo.id}`, starInsertError)
          continue
        }

        starInsert && (cache.stars[starInsert.id] = starInsert);
      }
    })

  // check whether we have new data to cache
  consoleHeader('Versioning changes')
  if (Object.keys(cache.stars).length > 0) {
    console.log('cron.json cached users: ', Object.keys(cron.checked).length)
    console.log('cron.json parsed users: ', que.installations.length)

    // write to file and commit block
    await writeFile('./hot-supabase/cron.json', JSON.stringify({
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
