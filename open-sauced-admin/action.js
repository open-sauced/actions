import { App } from "octokit"
import dotenv from "dotenv"

dotenv.config() 

async function run() {
  const app = new App({
    appId: +process.env.OPEN_SAUCED_APP_ID,
    privateKey: process.env.OPEN_SAUCED_PRIVATE_KEY,
  })

  // iterate over all installation repos. Leveraging the installation token
  // allows us to make changes across all installed repos
  await app.eachRepository(async ({repository, octokit}) => {
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
      path: "data.json"
    }).catch((err) => {
      console.log(err);
    });

    // convert from base64 to parseable JSOON 
    // (replace with octokit/plugin-create-or-update-text-file.js)
    const content = Buffer.from(data.content, "base64").toString()
    const parsedData = JSON.parse(content)

    // update repo stats
    for (const item of parsedData) {
      const [owner, repo] = item.full_name.split("/")
      const currentRepoResponse = await octokit.rest.repos.get({owner, repo})
      item.stargazers_count = currentRepoResponse.data.stargazers_count
      item.forks_count = currentRepoResponse.data.forks_count
      item.open_issues_count = currentRepoResponse.data.open_issues_count
    }
    
    // convert back to base64 (replace with octokit/plugin-create-or-update-text-file.js)
    const dataString = JSON.stringify(parsedData, null, 2)
    const base64String = Buffer.from(dataString).toString("base64")
    
    // only make commit if there are changes
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: repository.owner.login,
      repo: repository.name, 
      path: "data.json", 
      content: base64String, 
      message: "updated goal data", 
      sha: data.sha 
    })
    
    console.log(`UPDATED: ${repository.html_url}`)
  })
}

run()
