import consoleHeader from './lib/consoleHeader.js'
import api from "./lib/persistedGraphQL.js";
import fetchContributorNames from "./lib/contributorNameHelper.js";
import {p} from "@antfu/utils";
import {supabase} from "./lib/supabase.js";

const limitDays = parseInt(process.env.LIMIT_CONTRIBUTOR_DAYS) || 5
const lastExecuted = new Date()

consoleHeader(' OPEN |SAUCED', {
  font: 'block',
})
console.log(`Started execution at ${lastExecuted}`)

async function run() {
  const testDate = new Date(lastExecuted.getTime() - (limitDays * 24 * 60 * 60 * 1000))

  const {data: getAvailableRepo, error} = await supabase
    .from('repos')
    .select('*')
    .lte('last_fetched_contributors_at', JSON.stringify(testDate))
    .limit(1)
    .single()

  if (error) {
    console.log(`Unable to fetch repos from supabase`, error)
    return
  }

  const [owner, repo] = getAvailableRepo.full_name.split('/');
  const {data, errors} = await api.persistedRepoDataFetch({owner, repo})

  if (errors && errors.length > 0) {
    console.log(`ERROR for ${owner}/${repo}`, errors)
    return
  }

  if (
    data.gitHub.repositoryOwner === null
    || typeof data.gitHub.repositoryOwner.repository !== "object"
  ) {
    console.log(`ERROR for ${owner}/${repo}`, "No owner")
    return
  }

  console.log(`Fetched repo ${getAvailableRepo.full_name}, getting contributor graph`,)

  const {contributors_oneGraph} = data.gitHub.repositoryOwner.repository

  const contributorNames = await fetchContributorNames(contributors_oneGraph.nodes)

  const contributions = []

  consoleHeader('Parsing contributions')
  await p(contributorNames.slice(0, 100))
    .map(async (contributor) => {
      const query = `repo:${owner}/${repo} type:pr is:merged author:${contributor}`;
      const {data, errors} = await api.persistedGitHubContributions({query});
      const prCount = typeof data.gitHub.search.nodes !== "undefined" && data.gitHub.search.nodes.length || 0;

      if (errors && errors.length > 0) {
        console.log(`Error executing persistedQuery: ${query}`, errors);
        return;
      }

      const contribution = {
        repo_id: getAvailableRepo.id,
        contributor,
        count: prCount,
        last_merged_at: data.gitHub.search.nodes[0].mergedAt,
        url: data.gitHub.search.nodes[0].url,
      }

      if (prCount > 0) {
        console.log(`Pushing ${prCount} contributions from ${contributor} to ${getAvailableRepo.full_name}`)
        contributions.push(contribution)

        return contribution
      }
    })

  const {count, error: bulkInsertError} = await supabase
    .from('contributions')
    .upsert(contributions, {
      onConflict: 'repo_id, contributor',
      count: 'exact'
    })

  if (bulkInsertError) {
    console.log(`Unable to upsert contributions`, bulkInsertError)
    return
  }

  consoleHeader('Versioning changes')

  const {error: timestampUpdateError} = await supabase
    .from('repos')
    .update({
      last_fetched_contributors_at: JSON.stringify(lastExecuted),
    }, {})
    .eq('id', getAvailableRepo.id)

  if (timestampUpdateError) {
    console.log(`Unable to update timestamp`, timestampUpdateError)
    return
  }

  console.log('Total parsed contributors: ', count)

  consoleHeader('Finished')
}

await run()
