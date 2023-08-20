// Node Server that manages, saves and processes images for MarblesNameGrabber

// const express = require('express')
// const path = require('node:path'); 
import express from 'express'
import path from 'node:path'

// const MarbleNameGrabberNode = require("./MarblesNameGrabberNode")
import {MarbleNameGrabberNode} from "./MarblesNameGrabberNode.mjs"
import {UsernameTracker, Heap, LimitedList} from './UsernameTrackerClass.mjs'

// const { createWorker } = require('tesseract.js');
// const { setInterval } = require('node:timers');
import { createWorker, createScheduler } from 'tesseract.js'
import { setInterval } from 'node:timers'

const server = express()
const PORT = 4000;
const HOST = 'localhost'


const debug = true;
const debugTesseract = false;
const SERVER_STATE_ENUM = {
    STOPPED: 'STOPPED',
    RUNNING: 'RUNNING',
    READING: 'READING'
}
let serverState = SERVER_STATE_ENUM.STOPPED
let parserInterval = null

let filename = null;
// let tesseractWorker = null;
// let tesseractPromise = null;
let OCRScheduler = null
let numOCRWorkers = 0

const READ_IMG_TIMEOUT = 1000 * 0.7;

const usernameList = new UsernameTracker();

// Debug code
{

    console.log("Running special debug")
    
    // let user1 = 'hello'
    // let user2 = 'kelm'

    // let dist = usernameList.calcLevenDistance(user1, user2)

    // console.debug(`Result is ${dist}`)
}


// Declaring general functions
async function setupWorkerPool (workers=1) {
    // Setup scheduler and multiple OCR workers

    if (OCRScheduler == null)
        OCRScheduler = createScheduler()

    let promList = []
    while (numOCRWorkers < workers) {
        promList.push(addOCRWorker(numOCRWorkers++))
    }
    return promList
}

async function shutdownWorkerPool () {
    // Terminate workers in scheduler
    return OCRScheduler.terminate()
    // TODO: Change this maybe?
}

function parseImgFile() {
    // console.log("We're doing it LIVE!")
    filename = "live.png"
    
    let mng = new MarbleNameGrabberNode(filename, true)

    console.debug("Parsing LIVE image read")

    mng.buildBuffer()
    .catch( err => {
        console.warn("Buffer was not created successfully, skipping")
        throw err
    }).then( () =>  mng.isolateUserNames()
    ).then( buffer =>  scheduleTextRecogn(buffer)
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

async function debugRun () {
    console.log(`Running debug!`)
    filename = "testing/test.png"
    console.log(`Working directory: ${path.resolve()}`)
    
    await setupWorkerPool(1)
    // generateWorker()    // init worker

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
            console.error(`An unknown error occurred ${err}`)
            throw err
        }
    )
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
                tessedit_pageseg_mode: '6',      // read as vertical block of uniform text

            })
        }).then( result => {
            console.debug("Tesseract worker is built & init")
            return Promise.resolve(tesseractWorker)
        })
    
    return tesseractPromise
}

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

async function scheduleTextRecogn (imageLike) {
    // Create OCR job on scheduler
    return OCRScheduler.addJob('recognize', imageLike)
}

async function recognizeText(imageLike) {
    if (tesseractPromise) {
        // console.debug("Waiting for tesseract worker")
        await tesseractPromise
        // console.debug("Got worker")
    }
    // Promise.all([tesseractPromise])
    let {data} = await tesseractWorker.recognize(imageLike)

    // let lines = data.lines.map( line => line.text)
    // console.debug(`Recognized data: ${lines.join('')}`)
    return Promise.resolve(data)
}

async function terminateWorker() {
    await tesseractWorker.terminate()
}


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


server.get('/debug', (req, res) => {
    debugRun().then( ({data, info}) => {
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
