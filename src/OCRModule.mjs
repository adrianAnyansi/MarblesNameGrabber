// OCR stuff

import { XMLParser } from 'fast-xml-parser'
import { ChildProcess, spawn } from 'node:child_process'

/**
 * @typedef {string | Object} OCRResponse
 * 
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
    warmUp(num_workers) {
        this.workers = num_workers
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
    static TESSERACT_LOC = String.raw`C:\Program Files\Tesseract-OCR\tesseract.exe`
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

        /** Output the HOCR functions */
        this.hocr = hocr
    }

    get queueSize () {
        return this.queueNum
    }

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
        
        retPromise.finally(_ => {
            if (NativeTesseractOCRManager.PROMISE_DEBUG)
                console.warn(`Completed Q ${this.queue.length}, QN: ${this.queueNum}-1`); 
            this.queueNum--
        })

        return retPromise
    }

    /**
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

    async testPromise () {
        return new Promise ((res, rej) => {
            setTimeout( _ => res(), Math.random() * 10_000)
        })
    }

    /**
     * Queue an OCR request
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
        tessProcess.stdin.end(
            input_buffer
        );

        return retPromise
    }

}