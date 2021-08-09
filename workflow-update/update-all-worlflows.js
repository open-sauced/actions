import { App } from "octokit"
import dotenv from "dotenv"

dotenv.config()


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


    // fetch from the source of truth (goals-template)
    const template = await octokit.rest.repos.getContent({
      owner: "open-sauced",
      repo: "goals-template",
      path: "VERSION"
    })

    // user's workflow data
    const {data} = await octokit.rest.repos.getContent({
      owner: repository.owner.login,
      repo: repository.name,
      path: "VERSION"
    })

    // only make commit if there are changes
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: login,
      repo: "open-sauced-goals",
      path: "VERSION",
      content: template.data.content,
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
