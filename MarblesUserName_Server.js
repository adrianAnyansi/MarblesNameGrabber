// Node Server that manages, saves and processes images for MarblesNameGrabber

import express from 'express'
import path from 'node:path'
import fs from 'node:fs'

import { spawn } from 'node:child_process'

import {MarbleNameGrabberNode} from "./MarblesNameGrabberNode.mjs"
import {UsernameTracker, Heap, LimitedList} from './UsernameTrackerClass.mjs'

import { createWorker, createScheduler } from 'tesseract.js'
import { setInterval } from 'node:timers'

const server = express()
const PORT = 4000;
const HOST = 'localhost'

// debug variables
const debug = true;
const debugTesseract = false;

// server state
const SERVER_STATE_ENUM = {
    STOPPED: 'STOPPED',
    RUNNING: 'RUNNING',
    READING: 'READING'
}
let serverState = SERVER_STATE_ENUM.STOPPED
let parserInterval = null

const DEBUG_URL = 'https://www.twitch.tv/videos/1891700539?t=2h30m20s'
const LIVE_URL = '"https://www.twitch.tv/barbarousking"'
const streamlinkCmd = ['streamlink', '"https://www.twitch.tv/videos/1895894790?t=06h39m40s"', 'best', '--stdout'] 
const ffmpegCmd = ['ffmpeg', '-re', '-f mpegts', '-i pipe:0', '-f image2', '-pix_fmt rgba', '-vf fps=fps=1/2', '-y', '-update 1', 'live.png']

let streamlinkProcess = null
let ffmpegProcess = null

const TEST_FILENAME = "testing/test.png"
const LIVE_FILENAME = "live.png"


// Tesseract variables
let OCRScheduler = null
let numOCRWorkers = 0

const READ_IMG_TIMEOUT = 1000 * 0.25;
let lastReadTs = null

const usernameList = new UsernameTracker();

// Debug code
// {

//     console.log("Running special debug")
    
//     // let user1 = 'hello'
//     // let user2 = 'kelm'

//     // let dist = usernameList.calcLevenDistance(user1, user2)

//     // console.debug(`Result is ${dist}`)
// }


// Declaring general functions
async function setupWorkerPool (workers=1) {
    // Setup scheduler and multiple OCR workers

    if (OCRScheduler == null)
        OCRScheduler = createScheduler()

    let promList = []
    while (numOCRWorkers < workers) {
        promList.push(addOCRWorker(numOCRWorkers++))
    }
    
    if (promList.length == 0) return Promise.resolve(true) // TODO: Worker list of something
    return Promise.any(promList)
}

async function shutdownWorkerPool () {
    // Terminate workers in scheduler
    return OCRScheduler.terminate()
    // TODO: Change this to just terminate some workers?
}


// Server processing functions
function startStreamMonitor(streamURL=null) {
    // Start process for stream url

    if (streamlinkProcess) return

    streamURL ??= DEBUG_URL
    streamlinkProcess = spawn(streamlinkCmd[0], [streamURL, 'best'], {

    })
    streamlinkProcess.stdout.on('data', (data) => {
        console.log(data.toString())
    })
}

function startFFMpegProcess() {
    // start process for ffmpeg

    if (ffmpegProcess) return

    ffmpegProcess = spawn(ffmpegCmd[0], ffmpegCmd.slice(1))
    
}

function parseImgFile() {
    // console.log("We're doing it LIVE!")
    let filename = LIVE_FILENAME
    let fileUpdateTs = fs.statSync(path.resolve(filename)).mtime.getTime()

    // TODO: Wait until workerpool is ready

    if (lastReadTs && lastReadTs == fileUpdateTs) {
        console.debug(`Already queued file with dt ${new Date(fileUpdateTs)}`)
        return
    }
        
    lastReadTs = fileUpdateTs
    const options = {
        "id": `file_dt_${lastReadTs}`,
        "jobId": `file_dt_${lastReadTs}`,
    }
    
    let mng = new MarbleNameGrabberNode(filename, false)

    console.debug("Parsing LIVE image read")

    return mng.buildBuffer()
    .catch( err => {
        console.warn("Buffer was not created successfully, skipping")
        throw err
    }).then( () =>  mng.isolateUserNames()
    ).then( buffer =>  scheduleTextRecogn(buffer, options)
    ).then( ({data, info}) => {
        // add to nameBuffer
        for (const line of data.lines) {
            let username = line.text.trim()
            if (username == '' || username.length <= 2) continue

            usernameList.add(username, line.confidence)
        }
        console.debug(`UserList is now: ${usernameList.length}`)
    }).catch ( err => {
        console.warn(`Error occurred ${err}, execution exited`)
        // Since this is continous, this info is discarded
    })
}

async function debugRun (filename) {
    console.log(`Running debug! ${filename}`)
    console.log(`Working directory: ${path.resolve()}`)
    
    await setupWorkerPool(1)

    let mng = new MarbleNameGrabberNode(filename, true)
    return mng.buildBuffer()
    .catch( err => {
        console.warn("Buffer was not created successfully, skipping")
        throw err
    })
    .then( () => mng.isolateUserNames()
    )
    .then( 
        buffer => scheduleTextRecogn(buffer)
    ).catch(
        err => {
            console.error(`Debug: An unknown error occurred ${err}`)
            throw err
        }
    )
}

// Tesseract.js
async function addOCRWorker (worker_num) {
    console.debug(`Creating Tesseract worker ${worker_num}`)

    const options = {}
    if (debugTesseract) {
        options["logger"] = msg => console.debug(msg)
        options["errorHandler"]  = msg => console.error(msg)
    }

    let tesseractWorker = await createWorker(options)
    await tesseractWorker.loadLanguage('eng')
    await tesseractWorker.initialize('eng');
    await tesseractWorker.setParameters({
        tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPKRSTUVWXYZ_0123456789', // only search a-z, _, 0-9
        preserve_interword_spaces: '0', // discard spaces between words
        tessedit_pageseg_mode: '6',      // read as vertical block of uniform text
    })

    console.debug(`Tesseract Worker ${worker_num} is built & init`)
    OCRScheduler.addWorker(tesseractWorker)
    return tesseractWorker

}

async function scheduleTextRecogn (imageLike, options) {
    // Create OCR job on scheduler
    return OCRScheduler.addJob('recognize', imageLike, options)
}

// ---------------------------------------------------------------
// Server part

server.use(express.json()) // for parsing application/json
server.use(express.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded

server.get('/alive', (req, res) => {
    res.send('5alive');
})

// Admin functions

server.all('/start', (req, res) => {
    if (parserInterval == null) {
        console.log("Starting up image parser")
        usernameList.clear()
        // generateWorker()
        setupWorkerPool(4)
        parserInterval = setInterval(parseImgFile, READ_IMG_TIMEOUT)
        serverState = SERVER_STATE_ENUM.RUNNING
    }

    res.send({state: serverState, text:"Running"})
})

server.all('/stop', (req, res) => {
    if (parserInterval) {
        console.log("Stopping image parser")
        // TODO: Stop workers without killing the scheduler
        serverState = SERVER_STATE_ENUM.STOPPED

        clearInterval(parserInterval)
        parserInterval = null
    }

    res.send({state: serverState, text:"Stopped"})
})

server.get('/find/:userId', (req, res) => {
    // See if a user is in the system
    let reqUsername = req.params.userId
    console.debug(`Finding user ${reqUsername}`)
    return res.json(usernameList.find(reqUsername))
})

server.all('/add', (req, res) => {
    let jsonList = req.body
    console.debug(`Body is ${jsonList.toString()}`)
    console.debug(`Adding ${jsonList["userList"].length} users`)
    for (let user in jsonList["userList"])
        usernameList.add(user, 101)
    return res.status(200).send('Added')
})

// User functions

server.get('/list', (req, res) => {
    res.send({
        len: usernameList.length,
        userList: [usernameList.list]
    })
})


server.get(['/debug'], 
(req, res) => {

    let filename = req.query?.filename
    if (!filename) filename = TEST_FILENAME

    debugRun(filename).then( ({data, info}) => {
        let retList = []
        for (let line of data.lines) {
            let username = line.text.trim()
            if (username != '' && username.length > 2) {
                retList.push(username)
                usernameList.add(username, line.confidence)
            }
        }
        res.send({list: retList, debug:true})
        console.debug("Sent debug response")
    }).catch( err => {
        res.status(400).send(`An unknown error occurred. ${err}`)
    })
})

server.get('/monitor', (req, res) => {

    console.debug('Starting up streamlink')
    startStreamMonitor()
    res.status(200).send('started streamlink')
})

server.listen(PORT, () => {
    console.log(`Server running at ${HOST}:${PORT}`)
})



// Debug code in here


// Working encode + decoder
// RUN THIS IN COMMAND PROMPT
// ffmpeg -i "C:\Users\MiloticMaster\Videos\MGS joke\barbCut_480.mp4" -f matroska pipe:1 | ffmpeg -f matroska -i pipe:0 output.mp4
// streamlink twitch.tv/barbarousking best --stdout | ffmpeg -f mpegts -i pipe:0 -vf fps=1 -y -update 1 testing/live.png

// VOD testing

// streamlink "https://www.twitch.tv/videos/1891700539?t=2h30m22s" best 
/* streamlink "https://www.twitch.tv/videos/1895894790?t=06h39m40s" best
  streamlink "https://www.twitch.tv/videos/1895894790?t=06h39m40s" best --stdout | ffmpeg -re -f mpegts -i pipe:0 -f image2 -pix_fmt rgba -vf fps=fps=1/2 -y -update 1 live.png
  
  streamlink "https://www.twitch.tv/videos/1895894790?t=06h39m40s" best --stdout | ffmpeg -re -f mpegts -i pipe:0 -copyts -f image2 -pix_fmt rgba -vf fps=fps=1/2 -frame_pts true %d.png

  Explaining ffmpeg mysteries
    streamlink       = (program for natively downloading streams)
    <twitch-vod url> = se
    best             = streamlink quality option
    --stdout         = output stream to the stdout pipe

    ffmpeg
    -re = read at the native readrate (so realtime)
    -f mpegts = the input encoded pipe media format (for Twitch)
    -i pipe:0 = input is stdin (from previous pipe)
    -f image2 = use the image2 encoder (for files)
    -pix_fmt rgba = output png is rgba (32 bit depth)
    -vf         = video filters or something
        fps=fps=1/2 = create a screenshot 1/2 per second (2 times a second)
    -y          = do not confirm overwriting the output file
    -update     = continue to overwrite the output file/screenshot
    <screenshot.png> = output filename
*/
