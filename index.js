const axios = require('axios')
const { ScreepsAPI } = require('screeps-api')
const fs = require('fs').promises
const debug = false

let api

async function run () {
  api = await ScreepsAPI.fromConfig('main', 'main')
  const log = (...a) => debug ? console.log(...a) : ''
  await api.me()
  await api.socket.connect()
  const shardNames = (await api.raw.game.shards.info()).shards.map(s => s.name)
  /** /
  const shards = JSON.parse(await fs.readFile('output.json'))
  /**/
  console.log('scanning sectors')
  const shards = {}
  for(const shard of shardNames) {
    const data = await getSectors(shard)
    shards[shard] = data
  }
  /**/
  console.log('scanning portal rooms')
  const portalRooms = []
  for (const [shard, { roomMaps }] of Object.entries(shards)) {
    const time = Math.floor((await api.raw.game.time(shard)).time / 100) * 100 - 200
    shards[shard].portals = []
    let count = 0
    for(const room in roomMaps) {
      if(roomMaps[room].p && roomMaps[room].p.length) {
        portalRooms.push([shard, room])
      }
    }
  }

  const BATCH_SIZE=500
  const batches = []
  while(portalRooms.length) {
    batches.push(portalRooms.splice(0, BATCH_SIZE))
  }
  for(const batch of batches) {
    await Promise.all(batch.map(async ([shard, room]) => {
      const { objects } = await getRoomObjects(shard, room)
      shards[shard].portals.push(...Object.values(objects).filter(o => o.type === 'portal'))
      process.stdout.write('.')
    }))
    process.stdout.write('_')
    await sleep(200)    
  }
  /**/
  await Promise.all(Object.entries(shards).map(([shard, { roomInfo, roomMaps, portals, users }]) => Promise.all([
    fs.writeFile(`${shard}.roominfo.json`, JSON.stringify(roomInfo)),
    fs.writeFile(`${shard}.roommaps.json`, JSON.stringify(roomMaps)),
    fs.writeFile(`${shard}.portals.json`, JSON.stringify(portals)),
    fs.writeFile(`${shard}.users.json`, JSON.stringify(users)),
  ])))
  await api.socket.disconnect()
}

run().catch(console.error)

async function getSectors(shard) {
  const size = shard == 'shard0' ? 90 : 60
  const infoRooms = []
  const mapRooms = []
  for(let y = 0; y <= size; y++) {
    for(let x = 0; x <= size; x++) {
      // if(x % 10 == 5 && y % 10 == 5) {
        mapRooms.push(`E${x}N${y}`, `W${x}N${y}`, `E${x}S${y}`, `W${x}S${y}`)
      // }
      infoRooms.push(`E${x}N${y}`, `W${x}N${y}`, `E${x}S${y}`, `W${x}S${y}`)
    }
  }
  const { stats: roomInfo, users } = await api.raw.game.mapStats(infoRooms, 'owner0', shard)
  const roomMaps = {}
  await Promise.all(mapRooms.map(async room => {
    roomMaps[room] = await roomMap(shard, room)
  }))
  return {
    roomInfo,
    roomMaps,
    users,
  }
}

async function roomMap(shard, room) {
  return new Promise((resolve, reject) => {
    const key = `roomMap2:${shard}/${room}`
    api.socket.once(key, ({ data }) => {
      api.socket.unsubscribe(key)
      resolve(data)
    })
    api.socket.subscribe(key)
  })
}

async function getRoomObjects(shard, room) {
  return new Promise((resolve, reject) => {
    const key = `room:${shard}/${room}`
    api.socket.once(key, ({ data, error }) => {
      api.socket.unsubscribe(key)
      resolve(data)
    })
    api.socket.subscribe(key)
  })
}

async function sleep(ms) {
  return new Promise(res => setTimeout(() => res(), ms))
}