// OCR stuff

import { XMLParser } from 'fast-xml-parser'
import { ChildProcess, spawn } from 'node:child_process'
import { createWorker, createScheduler } from 'tesseract.js'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'

/**
 * @typedef {string | Object} OCRResponse
 */

/**
 * Enum representing supported OCRs
 */
export const OCRTypeEnum = {
    NATIVE: "NATIVE",
    LAMBDA: "LAMBDA",
    NODE_WORKER: "NODE_WORKER"
}

/**
 * OCR class to surface OCR methods and hiding implementation
 */
export class OCRManager {

    /** default workers to warm up */
    static DEFAULT_WORKERS = null
    static NAME = 'UNHANDLED_OCR'
    static XML_PARSER = new XMLParser({ignoreAttributes:false});

    constructor(concurrency=null, debug=false) {
        /** num workers allowed*/
        this.concurrency = concurrency ?? this.constructor.DEFAULT_WORKERS
        /** Debug logging */
        this.debug = debug
    }
    
    /**
     * Warm up N number of workers for this OCR
     */
    warmUp() {
    }

    /**
     * Return the queued workers for this OCR
     */
    get queueSize () {
        return null
    }

    /**
     * Queue an OCR request
     * @param {Buffer} buffer of valid image format
     * @returns {Promise<OCRResponse>} OCR response
     */
    async queueOCR (buffer) {

    }

    /**
     * Perform an OCR request
     * @param {Buffer} buffer of valid image format
     * @returns {Promise<OCRResponse>} OCR response
     */
    async performOCR (buffer) {

    }

    /**
     * Shutdown the OCR, quitting workers and releasing resources
     */
    shutdown () {

    }

    /**
     * Really simple XML parser for HOCR to get the info I need.
     * 
    */
    parseHOCRResponse(output_text) {
        const json_obj = OCRManager.XML_PARSER.parse(output_text);
        let ret_obj = {
            lines: [],
            xml:json_obj
        }
        
        // TODO: Throw error if malformed

        function getXMLChildren(xmlNode_s) {
            if (!xmlNode_s) return []
            if (Array.isArray(xmlNode_s)) return xmlNode_s
            return [xmlNode_s]
        }
        
        for (const ocr_page of getXMLChildren(json_obj.html.body.div)) { // this is the page level
            for (const ocr_carea of getXMLChildren(ocr_page?.div)) { // column level
                for (const ocr_par of getXMLChildren(ocr_carea?.p)) { // paragraph level
                    for (const ocr_line of getXMLChildren(ocr_par?.span)) { // line level

                        const currLine = {}
                        ret_obj.lines.push(currLine)
                        // For each line, pull the bounding box from title
                        // TODO: Need to ensure that this is parsed when fields exist, this is naive
                        const titleAttr = ocr_line["@_title"].split(';')
                        const bbox_arr = titleAttr[0].split(' ')
                        const bbox_rect = {
                            x0: parseInt(bbox_arr[1], 10),
                            y0: parseInt(bbox_arr[2], 10),
                            x1: parseInt(bbox_arr[3], 10),
                            y1: parseInt(bbox_arr[4], 10),
                        }
                        currLine.bbox = bbox_rect

                        currLine.text = ""
                        currLine.confidence = 0;
                        currLine.char_conf_avg = 0;
                        currLine.conf = []
                        for (const ocr_word of getXMLChildren(ocr_line.span)) { // No curr instances of multiple words on 1 line
                            currLine.confidence = parseInt(ocr_word["@_title"].split(';')[1].trim().split(' ')[1], 10)
                            for (const ocr_cinfo of getXMLChildren(ocr_word.span)) {
                                currLine.text += ocr_cinfo["#text"]
                                // TODO: Also hardcoded attribute text values
                                const conf = parseInt(ocr_cinfo["@_title"].split(';')[1].trim().split(' ')[1], 10);
                                currLine.char_conf_avg += conf
                                currLine.conf.push(ocr_cinfo["#text"])
                            }
                            // NOTE: I am ignoring whitespace here. Could add this back if required
                        }
                        currLine.char_conf_avg /= currLine.conf.length * 1.3;
                        if (currLine.confidence < currLine.char_conf_avg)
                            currLine.confidence = currLine.char_conf_avg
                    }
                }
            }
        }

        return ret_obj
    }
}

/**
 * Perform OCR queued on native process
 */
export class NativeTesseractOCRManager extends OCRManager {

    static DEFAULT_WORKERS = 6
    static NAME = "Native Tesseract"
    static PROMISE_DEBUG = false
    static TESSERACT_LOC = String.raw`tesseract`
    static TESSERACT_ARGS = [
        // <image_filename>, '-', // stdin, stdout
        "-", "-",
        "--psm", "8", //"4", // 4 is for block of text of variable sizes
        "-l", "eng",
        "-c", "preserve_interword_spaces=1",
        "-c", "tessedit_char_whitelist=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQKRSTUVWXYZ_0123456789",
        "-c", "hocr_char_boxes=1",
        "hocr"
    ];


    constructor (concurrency=null, debug=false, hocr=true) {
        super(concurrency, debug)

        // this.concurrency = concurrency ?? NativeTesseractOCRManager.DEFAULT_WORKERS
        /** @type {Promise<OCRResponse>[]} queue of Promises in progress */
        this.queue = []
        /** @type {number} total queued promises */
        this.queueNum = 0
        /** @type {Promise[]} promises of OCRs in progress */
        this.processQueue = []
        /** @type {Promise<OCRResponse>} Promise maintaining the defer queue */
        this.queuePromise = null

        /** Output the HOCR  */
        this.hocr = hocr
    }

    get queueSize () {
        return this.queueNum
    }

    /**
     * Queue an OCR Request
     * @param {Buffer} input_buffer validImgBuffer
     */
    queueOCR (input_buffer) {

        let retPromise = null
        this.queueNum++

        if (this.queue.length >= this.concurrency) {
            if (this.debug)
                console.log(`Queuing Q ${this.queue.length} Total: ${this.queueNum}`)
            // put in queue[promise] waiting for 1 from queue to complete
            if (!this.queuePromise) // start up a promise
                this.queuePromise = Promise.any(this.queue)
            else 
                this.queuePromise = this.queuePromise.then( _ => {
                    return Promise.any(this.queue)
                })

            retPromise = this.queuePromise.then(
                _ => this.createPromise(input_buffer)
            )

        } else {
            this.queuePromise = null
            if (this.debug)
                console.log(`Adding to Q ${this.queue.length} Total: ${this.queueNum}`)
            retPromise = this.createPromise(input_buffer)
        }
        
        retPromise.catch( err => {
            console.log(`Error occured in NativeTess ${err}`)
            return 
        })
        retPromise.finally(_ => {
            if (NativeTesseractOCRManager.PROMISE_DEBUG)
                console.warn(`Completed Q ${this.queue.length}, QN: ${this.queueNum}-1`); 
            this.queueNum--
        })

        return retPromise
    }

    /**
     * Creates OCR promise on the queue, removing once complete. Starts OCR immediately
     * This promise should be treated as
     *      Add queue
     *      Run promise
     *      Remove queue
     *      Return promise result
     * @returns {Promise<OCRResponse>}
     */
    async createPromise(input_buffer) {
        // internal promise with the OCR response
        const intPromise = this.performOCR(input_buffer)
        this.queue.push(intPromise)
        if (NativeTesseractOCRManager.PROMISE_DEBUG)
            console.log(`Running Q ${this.queue.length}`)
        const ocrResponse = await intPromise;
        const qIndex = this.queue.indexOf(intPromise)
        if (NativeTesseractOCRManager.PROMISE_DEBUG)
            console.log(`Done Q ${qIndex}`)
        this.queue.splice(qIndex,1);
        return ocrResponse;
    }

    /**
     * Perform the OCR request, starts immediately
     * @param {Buffer} input_buffer of valid image format
     * @returns {Promise<OCRResponse>} OCR output if any
     */
    async performOCR (input_buffer) {
        let resolve, reject;
        const retPromise = new Promise((res, rej) => {
            resolve = res;
            reject = rej
        });

        const tessProcess = spawn(NativeTesseractOCRManager.TESSERACT_LOC, 
            NativeTesseractOCRManager.TESSERACT_ARGS, {
            stdio: ["pipe", "pipe", "pipe"]
        })          //stdin //stdout //stderr

        const tesseractStartTs = performance.now()

        tessProcess.stderr.on('data', (data) => {
            const stringOut = data.toString()
            if (this.debug)
                console.error("Tesseract [DATA]:", stringOut)
        })
        // Triggers after completion
        tessProcess.on('close', () => {
            // if (this.debug)
            //     console.warn(`Tesseract closed rn`)
            // reject()
        })

        let outputText = ""

        tessProcess.stdout.on('data', (buffer) => {
            outputText += buffer.toString();
        });

        tessProcess.stdout.on('end', () => {
            // This should be the XML format HOCR
            // Parsing into a usable line/bbox/symbol for the final text
            const tesseractData = this.hocr 
                ? this.parseHOCRResponse(outputText)
                : outputText

            // I don't know what's actually here so just say you got it
            // console.warn(`Tesseract process complete; ${tesseractData}`)
            resolve({
                data: tesseractData, 
                info: NativeTesseractOCRManager.NAME,
                time: (performance.now() - tesseractStartTs),
                jobId: null
            })
        })

        tessProcess.on('error', err => {
            if (this.debug)
                console.error(`Tesseract Bad [ERR] ${err}`)
            reject()
        })

        // Send buffer to tesseract process
        tessProcess.stdin.end(input_buffer);

        return retPromise
    }
}


/**
 * Test functionality that ensures that 
 */
export class TestTesseractOCRManager extends NativeTesseractOCRManager {

    /**
     * @returns {Promise<OCRResponse>}
     */
    async createPromise(input_buffer) {
        // internal promise with the OCR response
        const intPromise = this.testPromise(input_buffer)
        this.queue.push(intPromise)
        if (NativeTesseractOCRManager.PROMISE_DEBUG)
            console.log(`Running Q ${this.queue.length}`)
        const ocrResponse = await intPromise;
        const qIndex = this.queue.indexOf(intPromise)
        if (NativeTesseractOCRManager.PROMISE_DEBUG)
            console.log(`Done Q ${qIndex}`)
        this.queue.splice(qIndex,1);
        return ocrResponse;
    }

    
    async testPromise () {
        return new Promise ((res, rej) => {
            setTimeout( _ => res(), Math.random() * 10_000)
        })
    }
}

export class LambdaOCRManager extends OCRManager {

    static NAME = "LambdaTesseract"
    static AWS_LAMBDA_CONFIG = { region: 'us-east-1'}
    // static USE_LAMBDA = true
    // static NUM_LAMBDA_WORKERS = 12 // Num Lambda workers

    constructor (concurrency=null, debug=false, hocr=true) {
        super(concurrency, debug)

        // this.lambdaQueue = 0
        if (this.debug)
            LambdaOCRManager.AWS_LAMBDA_CONFIG["logger"] = console
        this.lambdaClient = new LambdaClient(LambdaOCRManager.AWS_LAMBDA_CONFIG)
        this.lambdaQueueNum = 0

        this.hocr = hocr
    }
    
    get queueSize () {
        return this.lambdaQueue
    }

    warmUp() {
        let lambda_id = 0
        while (lambda_id < workers) {
            this.sendWarmupLambda(`warmup ${lambda_id++}`)
        }
    }

    /** Send Warmup request to lambda */
    async sendWarmupLambda(jobId='test') {

        const payload = {
            buffer: "",
            jobId: jobId,
            warmup: true
        }

        const input = { // Invocation request
            FunctionName: "OCR-on-Marbles-Image",
            InvocationType: "RequestResponse",
            LogType: "Tail",
            Payload: JSON.stringify(payload), // stringified value
        }

        const command = new InvokeCommand(input)
        console.debug(`Sending lambda warmup ${jobId}`)
        return this.lambdaClient.send(command)
            .then(resp => resp['StatusCode'])

    }

    
    queueOCR (input_buffer, jobId) {
        this.lambdaQueueNum++
        const prom = this.sendImgToLambda(input_buffer)
        prom.finally(_ => this.lambdaQueueNum--)
        return prom
    }

    /**
     * Sends image file to lambda function, which returns a payload containing the tesseract information
     * 
     * @param {Buffer} input_buffer An buffer containing a image
     * @returns {Promise} Promise containing lambda result with tesseract info. Or throws an error
     */
    async sendImgToLambda(input_buffer, imgMetadata, info, jobId='test', lambdaTest=false) {
        const payload = {
            buffer: input_buffer.toString('base64'),
            imgMetadata: imgMetadata,
            info: info,
            jobId: jobId,
            test: lambdaTest
        }

        const input = { // Invocation request
            FunctionName: "OCR-on-Marbles-Image",
            InvocationType: "RequestResponse",
            LogType: "Tail",
            // ClientContext: "Context",
            Payload: JSON.stringify(payload), // stringified value
            // Qualifier: "Qualifier"
        }

        
        const command = new InvokeCommand(input)
        if (this.debug)
            console.debug(`Sending lambda request ${jobId}`)
        let result = await this.lambdaClient.send(command)

        if (result['StatusCode'] != 200)
            throw Error(result["LogResult"])
        else {
            let resPayload = JSON.parse(Buffer.from(result["Payload"]).toString())
            // let {data, info, jobId} = resPayload
            return resPayload
        }
    }
}

/**
 * Not mantaining this, but just want to keep my old code in here
 */
export class NodeOCRManager extends OCRManager {

    static NAME = "NodeOCRManager"
    static NUM_LIVE_WORKERS = 12 // Num Tesseract workers
    static WORKER_RECOGNIZE_PARAMS = {
    blocks:true, hocr:false, text:false, tsv:false
}

    /**
     * Setup schedulers & workers for OCR reading
     * @param {Number} workers 
     * @returns {Promise}
     */
    async setupWorkerPool (workers=1) {
        if (this.OCRScheduler == null)
            this.OCRScheduler = createScheduler()

        let promList = []
        while (this.numOCRWorkers < workers) {
            promList.push(this.addOCRWorker(this.numOCRWorkers++))
        }
        
        if (promList.length == 0) return Promise.resolve(true) // TODO: Worker list of something
        return Promise.any(promList)
    }

    /** Terminate workers in scheduler */
    async shutdownWorkerPool () {
        this.numOCRWorkers = 0
        return this.OCRScheduler.terminate()
        // TODO: Change this to just terminate some workers?
    }

    /**
     * Schedule text recognition on the OCR scheduler
     * @param {*} imageLike 
     * @param {*} options 
     * @returns 
     */
    async scheduleTextRecogn (imageLike, options) {
        // Create OCR job on scheduler
        if (!this.OCRScheduler) 
            throw Error('OCRScheduler is not init')
        return this.OCRScheduler.addJob('recognize', imageLike, options)
    }

    // Tesseract.js
    /**
     * Create new worker and add to scheduler
     * @param {*} worker_num worker id
     * @returns 
     */
    async addOCRWorker (worker_num) {
        console.debug(`Creating Tesseract worker ${worker_num}`)

        const options = {}
        if (this.debugTesseract) {
            options["logger"] = msg => console.debug(msg)
            options["errorHandler"]  = msg => console.error(msg)
        }

        let tesseractWorker = await createWorker(options)
        await tesseractWorker.loadLanguage('eng')
        await tesseractWorker.initialize('eng');
        await tesseractWorker.setParameters({
            tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQKRSTUVWXYZ_0123456789', // only search a-z, _, 0-9
            preserve_interword_spaces: '0', // discard spaces between words
            tessedit_pageseg_mode: '6',      // read as vertical block of uniform text
            // tessedit_pageseg_mode: '11',      // read individual characters (this is more likely to drop lines),
            // tessjs_create_hocr: "0",
            // tessjs_create_tsv: "0",
            // tessjs_create_box: "1",
            // tessjs_create_unlv: "0",
            // tessjs_create_osd: "0"
        })

        console.debug(`Tesseract Worker ${worker_num} is built & init`)
        this.OCRScheduler.addWorker(tesseractWorker)
        return tesseractWorker

    }
}