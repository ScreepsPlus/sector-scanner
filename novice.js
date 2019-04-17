'use strict';
const { ScreepsAPI } = require('screeps-api')
const fs = require('fs').promises
/*
// Node 8 shim for local testing
const {promisify} = require('util');
const fsr = require('fs')
let fs={};
fs.readFile = promisify(fsr.readFile);
fs.readdir = promisify(fsr.readdir);
fs.writeFile = promisify(fsr.writeFile);
*/

/*
Two output formats
* First indexed by the roomName and gives if its a novice or respawnArea (as the key) and the timestamp it ends
	Probably the most used to be able to lookup if a room is in a zone
* Second a set of novice and respawnAreas indexed by timestamp
	Useful to find a set of the other rooms in an area (use the First format from a room to get the type and timestamp then index into the other)

Could be argued we don't need to provide the second type, the user can do it if they want.
Therefore its in seperate json files and an optional second segment

const outputFormat1 = {
	room1Name:{ [novice/respawnArea]:timestampX },
	room2Name:{ [novice/respawnArea]:timestampY },
	room3Name:{ [novice/respawnArea]:timestampZ }
};

const outputFormat2 = {
	novice:{
		timestamp1: [room1Name, room2Name, room3Name],
		timestamp2: [room4Name, room5Name, room6Name]
	},
	respawnArea:{
		timestamp3: [room7Name, room8Name, room9Name]
	}
};
*/

async function run() {
  const [,,server,segment,segmentArea] = process.argv;
  const api = await ScreepsAPI.fromConfig(server);
  const files = await fs.readdir('.');
  const shardFiles = files.filter(f => f.endsWith('.roominfo.json'))
  for(const file of shardFiles) {
    console.log(`Processing ${file}`)
    const [shard] = file.split('.')
    const data = JSON.parse(await fs.readFile(file, 'utf8'))
    const raw=parseZones(data);
    await fs.writeFile(`${shard}.novice.json`, raw[0])
    await fs.writeFile(`${shard}.novice.area.json`, raw[1])
    if(server && segment) {
      console.log(`Uploading to segment ${segment} on ${shard} of ${server}`)
      await api.memory.segment.set(+segment, raw[0], shard)
    }
    if(server && segmentArea) {
      console.log(`Uploading to segment ${segmentArea} on ${shard} of ${server}`)
      await api.memory.segment.set(+segmentArea, raw[1], shard)
    }
  }
  console.log('Done!')
}

run().catch(console.error)

function parseZones(data)
{
	let nnRooms={};
	let areas={novice:{},respawnArea:{}};
	const nowDate=Date.now();

	for (let roomName in data)
	{
		let roomData=data[roomName];
		// only want normal rooms, ignore "out of borders"
		// and one of the types of respawn is in the future
		if (roomData.status=="normal" && (roomData.novice>nowDate || roomData.respawnArea>nowDate))
		{
			// select which it is and get the value
			let key="respawnArea";
			if (roomData.novice>nowDate)
			{
				key="novice";
			}
			const value=roomData[key];

			// add to the basic map
			nnRooms[roomName]={};
			nnRooms[roomName][key]=value;

			// and add to an area map
			if (!areas[key][value]) // create the area if it doesn't exist yet
			{
				areas[key][value]=[];
			}
			areas[key][value].push(roomName);
		}
	}

	console.log("Rooms:",Object.keys(nnRooms).length,"Novice areas:",Object.keys(areas.novice).length,"Respawn areas:",Object.keys(areas.respawnArea).length);
	let asStringR= JSON.stringify(nnRooms);
	//console.log(JSON.stringify(nnRooms, null, 2));
	if (asStringR.length>100000)
	{
		console.log("Size too big",asStringR.length,"setting fallback error");
		asStringR= JSON.stringify({error:true});
	}
	let asStringA= JSON.stringify(areas);
	//console.log(JSON.stringify(areas, null, 2));
	if (asStringA.length>100000)
	{
		console.log("Size too big",asStringA.length,"setting fallback error");
		asStringA= JSON.stringify({error:true});
	}
	console.log("Output sizes, Rooms:", asStringR.length, "Areas:", asStringA.length);

	return [asStringR,asStringA];
}

