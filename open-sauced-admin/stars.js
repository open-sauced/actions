import { App } from "octokit"
import dotenv from "dotenv"

dotenv.config() 

async function createStarJSON(octokit, user) {
  const {data} = await octokit.request('GET /users/{user}/starred', {
    user: user,
  }).catch(err => {
    console.log(err)
  })
  return Promise.all(
    data.map(async repo => {
  
    return {
      full_name: repo.full_name,
      stargazers_count: repo.stargazers_count,
      open_issues_count: repo.open_issues_count,
      forks_count: repo.forks_count
    }
  }))
}

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
    
    try {
      const {data} = await octokit.rest.repos.getContent({
        owner: repository.owner.login,
        repo: repository.name,
        path: "stars.json"
      }).catch((err) => {
        
        console.log(`stars.json: ${err.status}`)
        if (err.status == 404) {
          console.log(`stars.json: ${err.response.data.message}`)
        }
        
        return {data: {status: 404, content: []}}
      });

      let parsedData

      if (data.status == 404) {
        const starsData = await createStarJSON(octokit, repository.owner.login)
        parsedData = starsData
      }

      if (data.status != 404) {
        // convert from base64 to parseable JSOON 
        const content = Buffer.from(data.content, "base64").toString()
        parsedData = JSON.parse(content)

        // update repo stats
        for (const item of parsedData) {
          const [owner, repo] = item.full_name.split("/")
          const currentRepoResponse = await octokit.rest.repos.get({owner, repo})
          item.stargazers_count = currentRepoResponse.data.stargazers_count
          item.forks_count = currentRepoResponse.data.forks_count
          item.open_issues_count = currentRepoResponse.data.open_issues_count
        }
      }
      
      const dataString = JSON.stringify(parsedData, null, 2)
      const base64String = Buffer.from(dataString).toString("base64")
      
      // only make commit if there are changes
      await octokit.rest.repos.createOrUpdateFileContents({
        owner: repository.owner.login,
        repo: repository.name, 
        path: "stars.json", 
        content: base64String, 
        message: "updated stars data", 
        sha: data.sha 
      })
      
      console.log(`UPDATED: ${repository.html_url}`)
    } catch (err) {
      console.log(`stars.json: ${err}`)
      console.log(`SKIPPED: ${repository.html_url}`)
      return
    }
  })
}

run()
