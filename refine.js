const { ScreepsAPI } = require('screeps-api')
const fs = require('fs').promises

const ROOM_REGEX = /^[EW][0-9]*[05][NS][0-9]*[05]$/

async function run() {
  const [,,server,segment] = process.argv
  const api = await ScreepsAPI.fromConfig(server)
  const files = await fs.readdir('.')
  const shardFiles = files.filter(f => f.endsWith('.portals.json'))
  for(const file of shardFiles) {
    console.log(`Processing ${file}`)
    const [shard] = file.split('.')
    const data = JSON.parse(await fs.readFile(file, 'utf8'))
    const map = new Map()
    for(const portal of data) {
      const { 
        room: fromRoom, 
        destination: {
          shard: toShard = shard,
          room: toRoom
        },
        unstableDate
      } = portal
      if(!fromRoom.match(ROOM_REGEX) || !toRoom.match(ROOM_REGEX)) {
        continue
      }
      const key = `${fromRoom} ${toShard} ${toRoom}`
      const rec = [fromRoom, toShard, toRoom]
      if (unstableDate) {
        rec.push(unstableDate)
      }
      map.set(key, rec)
    }
    const raw = JSON.stringify(Array.from(map.values()))
    await fs.writeFile(`${shard}.portals.min.json`, raw)
    if(server && segment) {
      console.log(`Uploading to segment ${segment} on ${shard} of ${server}`)
      await api.memory.segment.set(+segment, raw, shard)
    }
  }
  console.log('Done!')
}

run().catch(console.error)