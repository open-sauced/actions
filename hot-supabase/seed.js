import {p} from '@antfu/utils'

import {supabase, supaCount, supaDump, supaSeed} from './lib/supabase.js';
import consoleHeader from "./lib/consoleHeader.js";

const lastExecuted = new Date()
const tables = [
  'user_stars',
  'stars',
  'users',
  'recommendations',
  'votes',
]
const queue = []

consoleHeader(' OPEN |SAUCED', {
  font: 'block',
})
console.log(`Started execution at ${lastExecuted}`)

async function run() {
  consoleHeader('Parsing tables');
  await p(tables)
    .map(async (table) => {
      console.log(`Fetching counts for table ${table}`)
      const { count, error } = await supaCount(table)

      if (error) {
        console.log(`Error counting table ${table}`, error)
        return
      }

      console.log(`Table "${table}" count: ${count}`)

      if (count > 0) {
        queue.push({
          table,
          count,
        })
      }
    })

  consoleHeader('Parsing data')
  const seeds = await p(queue)
    .map(async ({ table, count }) => {
      console.log(`Parsing rows for table ${table}`)
      const tableQueue = p()
      const rows = []

      for (let i = 0; i < Math.ceil(count / 1000) * 1000; i += 1000) {
        tableQueue.add(
          supabase
            .from(table)
            .select('*')
            .range(i, i + 1000)
        )
      }

      await tableQueue
        .then((pages) => pages.forEach(({data, error}) => {
          !error && rows.push(...data)
        }))

      return {
        table,
        rows,
      }
    })
    .map(async ({ table, rows }) => {
      console.log(`Seeding ${table}.sql`)
      return supaDump('./seed/', table, Object.keys(rows[0]), rows)
    })

  consoleHeader('Versioning changes')
  await supaSeed(seeds)
  console.log('Wrote changes to supabase/seed.sql, make sure to commit this file')

  consoleHeader('Finished')
}

await run()
