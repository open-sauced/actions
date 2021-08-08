import { App } from "octokit"
import dotenv from "dotenv"

dotenv.config() 

const workflowURL = "https://api.github.com/repos/open-sauced/goals-template/contents/.github/workflows/goals-caching.yml"
//
//fetch this urll and get contents.
//
// convert back to base64 (replace with octokit/plugin-create-or-update-text-file.js)
// const dataString = JSON.stringify(workflow, null, 2)
const base64String = Buffer.from(workflow).toString("base64")

const login = process.env.LOGIN

async function run() {
  const app = new App({
    appId: +process.env.OPEN_SAUCED_APP_ID,
    privateKey: process.env.OPEN_SAUCED_PRIVATE_KEY,
  })

  // iterate over all installation repos. Leveraging the installation token
  // allows us to make changes across all installed repos
  await app.eachRepository({installationId: 9812988}, async ({repository, octokit}) => {
    // checkout only goal repos
    if (repository.name !== "open-sauced-goals") {
      return
    }

    // for debugging 
    // if (repository.full_name !== "bdougie/open-sauced-goals") {
    //   return
    // }

    const {data} = await octokit.rest.repos.getContent({
      owner: repository.owner.login,
      repo: repository.name,
      path: "VERSION"
      // path: ".github/workflows/goals-caching.yml"
    })

    console.log(data)

    // only make commit if there are changes
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: login,
      repo: "open-sauced-goals",
      path: "VERSION",
      content: base64String,
      message:"pdated from latest open-sauced/goals-template",
      sha: data.sha
    });


//     if (updated) {
//       console.log("test.txt updated via %s", commit.html_url);
//     } else {
//       console.log("test.txt already up to date");
//     }

    // remove 
    console.log(repository.html_url)
  })
}

run()
