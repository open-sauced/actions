import { App } from "octokit"
import dotenv from "dotenv"
import { createClient } from '@supabase/supabase-js'

// TODO: move to env
const anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTYyOTkzMDc3OCwiZXhwIjoxOTQ1NTA2Nzc4fQ.zcdbd7kDhk7iNSMo8SjsTaXi0wlLNNQcSZkzZ84NUDg"
const supabaseUrl = "https://ibcwmlhcimymasokhgvn.supabase.co"

// Create a single supabase client for interacting with your database
const supabase = createClient(supabaseUrl, anon_key)

dotenv.config() 

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

    try {
      const {data} = await octokit.rest.repos.getContent({
        owner: repository.owner.login,
        repo: repository.name,
        path: "stars.json"
      }).catch((err) => {
        console.log(`stars.json: ${err}`)
        return {data: {content: []}}
      });

      // convert from base64 to parseable JSOON 
      const content = Buffer.from(data.content, "base64").toString()
      const parsedData = JSON.parse(content)
      
     // send parsedData to supabase
     const result = await supabase
      .from('stars')
      .insert(parsedData)
    
      console.log(result) 
      
      console.log(`ADDED STARS FROM: ${repository.html_url}`)
    } catch (err) {
      console.log(`ERROR: ${err}`)
      console.log(`SKIPPED: ${repository.html_url}`)
      return
    }
  });
}

run()