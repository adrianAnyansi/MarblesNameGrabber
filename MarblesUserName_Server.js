// Node Server that manages, saves and processes images for MarblesNameGrabber

const http = require('http');
const path = require('node:path'); 
const MarbleNameGrabberNode = require("./MarblesNameGrabberNode")
const sharp = require('sharp')

const PORT = 4000;

const userNameRect = {
    x: 957/1920,
    y: 152/1080,
    w: (1507-957)/1920,
    h: (1080-154)/1080
}

const debug = true;
let filename = null;

// Run setup script

if (debug) {
    console.log(`Running debug!`)
    filename = "testing/test.png"

    console.log(`Working directory: ${path.resolve()}`)
    // let img = sharp(filename)
    // console.log(img)

    let mng = new MarbleNameGrabberNode(filename, true)
    mng.buildBuffer()
    mng.isolateUserNames()

} else {
    filename = "live.png"
}


// Server part

// http.createServer(function (req, res) {
//     res.writeHead(200, {'Content-Type': 'text/plain'})
//     res.end('Alive\n')
// }).listen(PORT, 'localhost')

// console.log(`Server running at localhost:${PORT}`)

// Debug code in here


// Working encode + decoder
// ffmpeg -i "C:\Users\MiloticMaster\Videos\MGS joke\barbCut_480.mp4" -f matroska pipe:1 | ffmpeg -f matroska -i pipe:0 output.mp4
// streamlink twitch.tv/barbarousking best --stdout | ffmpeg -f mpegts -i pipe:0 -vf fps=1 -y -update 1 testing/live.png
// 

// Testing on https://www.twitch.tv/videos/1895894790?t=06h41m23s
