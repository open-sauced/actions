import { App } from "octokit"
import dotenv from "dotenv"

dotenv.config() 

// console.log(process.env.OPEN_SAUCED_PRIVATE_KEY.substr(0, 100))

async function run() {
  const app = new App({
    appId: +process.env.OPEN_SAUCED_APP_ID,
    privateKey: process.env.OPEN_SAUCED_PRIVATE_KEY,
  })

  // iterate over all installations
  await app.eachRepository({installationId: 9812988}, async ({repository, octokit}) => {
    if (repository.name !== "open-sauced-goals") {
      
      return
    }

    if (repository.full_name !== "bdougie/open-sauced-goals") {
      return
    }
    const {data} = await octokit.rest.repos.getContent({
      owner: repository.owner.login,
      repo: repository.name,
      path: "data.json"
    })

    const content = Buffer.from(data.content, "base64").toString()
    const parsedData = JSON.parse(content)

    for (const item of parsedData) {
      const [owner, repo] = item.full_name.split("/")
      const currentRepoResponse = await octokit.rest.repos.get({owner, repo})
      item.stargazers_count = currentRepoResponse.data.stargazers_count
      item.forks_count = currentRepoResponse.data.forks_count
      item.open_issues_count = currentRepoResponse.data.open_issues_count

    }
    
    const dataString = JSON.stringify(parsedData, null, 2)
    const base64String = Buffer.from(dataString).toString("base64")
    
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: repository.owner.login,
      repo: repository.name, 
      path: "data.json", 
      content: base64String, 
      message: "updated goal data", 
      sha: data.sha 
    })
    
    console.log(repository.html_url)
  })
}

run()
