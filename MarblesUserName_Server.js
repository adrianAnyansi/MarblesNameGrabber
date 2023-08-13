// Node Server that manages, saves and processes images for MarblesNameGrabber

const http = require('http');
const PORT = 4000
const SHARP = require('sharp')

// http.createServer(function (req, res) {
//     res.writeHead(200, {'Content-Type': 'text/plain'})
//     res.end('Alive\n')
// }).listen(PORT, 'localhost')

// console.log(`Server running at localhost:${PORT}`)

// Debug code in here


// Working encode + decoder
// ffmpeg -i "C:\Users\MiloticMaster\Videos\MGS joke\barbCut_480.mp4" -f matroska pipe:1 | ffmpeg -f matroska -i pipe:0 output.mp4

console.log(`Running debug!`)