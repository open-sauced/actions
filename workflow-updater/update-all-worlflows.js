import { App } from "octokit"
import dotenv from "dotenv"

dotenv.config()

async function createIssueForError(octokit, owner, repo, installationId) {
  const blockedIssues = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    labels: ["bug"],
    state: "open"
  })

  if (blockedIssues.data.length > 0) {
    console.log(`issue already created`);
    return
  }

  const { data: issue } = await octokit.request("POST /repos/{owner}/{repo}/issues", {
    owner,
    repo,
    labels: ["bug"],
    title: `${owner}/${repo}`,
    body: `Please update your permissions with the Open Sauced App.\n\nThe Open Sauced App attempted to update this repository, but couldn't due to a pending permissions request. Please enable those permission using this [link]( https://github.com/settings/installations/${installationId}/permissions/update).`,
  })
  .catch((err) => {
    console.log(err.data.message);
  });

  console.log(`issue created at ${issue.html_url}`);
}

async function run(octokit) {
  const app = new App({
    appId: +process.env.OPEN_SAUCED_APP_ID,
    privateKey: process.env.OPEN_SAUCED_PRIVATE_KEY,
  })
  
  // iterate over all installation repos. Leveraging the installation token
  // allows us to make changes across all installed repos
  // the installationId is for my (bdougie/open-sauced-goal specific installation
  await app.eachInstallation(async ({ installation, octokit }) => {

    await app.eachRepository(async ({context, repository, octokit}) => {
      // checkout only goal repos
      if (repository.name !== "open-sauced-goals") {
        return
      }
      
      // fetch from the source of truth (goals-template)
      const template = await octokit.rest.repos.getContent({
        owner: "open-sauced",
        repo: "goals-template",
        path: ".github/workflows/goals-caching.yml"
      })
      
      // user's workflow data
      const {data} = await octokit.rest.repos.getContent({
        owner: repository.owner.login,
        repo: repository.name,
        path: ".github/workflows/goals-caching.yml"
      })
      
      // TODO: only make commit if there are changes
      try {
        await octokit.rest.repos.createOrUpdateFileContents({
          owner: repository.owner.login,
          repo: "open-sauced-goals",
          path: ".github/workflows/goals-caching.yml",
          content: template.data.content,
          message:"updated from latest open-sauced/goals-template",
          sha: data.sha
        })
      } catch(err) { 
        console.log("ERROR HAS BEEN CAUGHT: ", err.response.data.message) 
        
        // TODO: check if blocked label exist on issue named bdougie/open-sauced-goals
        const blockedIssues = await octokit.request('GET /repos/{owner}/{repo}/issues', {
          owner: repository.owner.login,
          repo: repository.name,
          labels: ["blocked"],
          state: "open"
        })

        const blocked = blockedIssues.length > 0

        if (blocked) {
          console.log(`BLOCKED: ${repository.html_url}`)
        }

        if (!blocked && err.status === 403) {
          // if it fails, try to create an issue
          await createIssueForError(octokit, repository.owner.login, repository.name, installation.id)
          console.log(`ISSUE OPENED: ${repository.html_url}`)
        }

        if (err.status === 404) {
          console.log(`MISSING: ${repository.html_url}`) 
        }
      }
    })
  })
}

run()
