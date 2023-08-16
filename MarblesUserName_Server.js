// Node Server that manages, saves and processes images for MarblesNameGrabber

const http = require('http');
const path = require('node:path'); 
const MarbleNameGrabberNode = require("./MarblesNameGrabberNode")

const { createWorker } = require('tesseract.js');



const PORT = 4000;

const debug = true;
let filename = null;
let tesseractWorker = null;
let tesseractPromise = null;

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

    generateWorker()    // init worker
    dirtyFilename = "testing/name_bin.png"
    recognizeText(dirtyFilename).then( () => {
        console.debug("Terminating worker")
        return terminateWorker()
    }).then( () => {
        console.debug("Completed Job")
    })

} else {
    filename = "live.png"
}


// Tesseract.js
async function generateWorker() {
    if (tesseractWorker != null) {
        return Promise.resolve(tesseractWorker)
    }

    console.debug("Creating Tesseract worker")
    const options = {}
    if (debug) {
        options["logger"] = msg => console.debug(msg)
    }

    
    tesseractPromise = createWorker(options)
        .then( worker => {
            tesseractWorker = worker
            return tesseractWorker.loadLanguage('eng');
        }).then( result => {
            return tesseractWorker.initialize('eng');
        }).then( result => {
            return tesseractWorker.setParameters({
                tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPKRSTUVWXYZ_0123456789', // only search a-z, _, 0-9
                preserve_interword_spaces: '0', // discard spaces between words
                tessedit_pageseg_mode: '6'      // read as vertical block of uniform text
            })
        }).then( result => {
            console.debug("Tesseract worker is built & init")
            return Promise.resolve(tesseractWorker)
        })
    
    return tesseractPromise
}

async function recognizeText(imageLike) {
    if (tesseractPromise) {
        console.debug("Waiting for tesseract worker")
        await tesseractPromise
        console.debug("Got worker")
    }
    // Promise.all([tesseractPromise])
    let {data} = await tesseractWorker.recognize(imageLike)

    let lines = data.lines.map( line => line.text)
    console.debug(`Recognized data: ${lines.join('')}`)
    return Promise.resolve(data)
}

async function terminateWorker() {
    await tesseractWorker.terminate()
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
// streamlink "https://www.twitch.tv/videos/1895894790?t=06h39m44s" best

// Testing on https://www.twitch.tv/videos/1895894790?t=06h41m23s
