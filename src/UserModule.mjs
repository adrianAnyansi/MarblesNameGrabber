// Username representation
// Need to isolate the root objects since they get shared

/**
 * @deprecated
 */
class Username {
    /**
     * Store info about the Username and etc
     * @param {String} name Username string
     * @param {Number} confidence confidence percentage
     * @param {Number} index Index in the full 1000 list
     * @param {Date} timestamp Ingest date
     */
    constructor (name, confidence, index, timestamp=null) {
        /** @type {string} most confident name */
        this.name = name                
        /** @type {number} confidence percentage */
        this.confidence = confidence
        /** @type {number} index in user list */
        this.index = index
        
        /** @type {number} ingest timestamp in ms */
        this.timestamp = timestamp      
        this.verifyAmount = 0           // verified by human
        /** @type {UserImage[]} images of the user */
        this.fullImgIdxList = []       

        /** @type {Set<string>} set of usernames that are at this index */
        this.aliases = new Set()
    }
}

/**
 * @deprecated
 */
class UserImage {
    /**
     * Object for storing Images and corresponding info
     * @param {*} pageIdx Which ingested page its on
     * @param {*} division Where on page its located
     * @param {*} buffer JPEG buffer
     * @param {*} userObj Link to username object
     */
    constructor (pageIdx, division, buffer, userObj) {
        this.pageIdx = pageIdx      // page captured
        this.division = division    // division on that page
        this.imgBuffer = buffer     // image object
        this.userObj = userObj      // link to userObj
    }
}

/**
 * @deprecated
 */
export class UsernameTracker {

    constructor () {
        this.hash = new Map()       // hash of names
        /** @type {Array<Username>} */
        this.usersInOrder = []  // List of UserObj in order

        this.pageIdx = 0           // Currently injested page
        /** @type {UserImage[]} images of the user */
        this.fullImageList = []     // All images in order

        this.unverifiedImgs = []    // List of usernames unsuccessfully read
        this.unverifiedUsers = new Set()   // Users yet to be verified

        this.lastPage = []      // Users on the last page
    }

    get length () {
        // return this.hash.size
        return this.usersInOrder.length
    }

    /**
     * Add username to userInOrder with object
     * @param {string} username 
     * @param {number} confidence 
     * @param {number} index 
     * @param {Date} capture_dt
     * @returns {Username}
     */
    add (username, confidence, index, capture_dt) {
        let userObj = this.usersInOrder.at(index)

        if (!userObj) {
            userObj = new Username(username, confidence, index, capture_dt)
            userObj.aliases.add(username)
            this.hash.set(username, userObj)
            this.usersInOrder[index] = userObj
        } else { // add alias
            userObj.aliases.add(username)
            this.hash.set(username, userObj)
            // if confidence higher, update userObj
            if (confidence > userObj.confidence ) {
                userObj.confidence = confidence
                userObj.name = username
            }
        }
        return userObj
    }

    /**
     * Deprecated (hash version of user)
     * @deprecated
     * @param {*} username 
     * @param {*} confidence 
     * @param {*} userVerify 
     * @returns 
     */
    addOld (username, confidence, userVerify=false) {
        let userObj = this.hash.get(username)

        if (userObj == undefined) {
            userObj = new Username(username, confidence)
            this.hash.set(username, userObj)

        } else {    // update confidence
            userObj.confidence = Math.max(confidence, userObj.confidence)

            if (userVerify) userObj.verifyAmount += 1
            else if (userObj.verifyAmount < 1)  userObj.verifyAmount = 1
        }
        
        return userObj
    }

    /**
     * Deprecated, no longer manually removing usernames
     * @deprecated
     * @param {*} username 
     * @returns 
     */
    remove(username) {
        if (!this.hash.has(username)) return null
        
        const user = this.hash.get(username)
        this.hash.delete(username)
    }

    rename(oldUsername, newUsername) {
        if (!this.hash.has(oldUsername)) return null

        const user = this.hash.get(oldUsername)
        this.hash.delete(oldUsername)
        this.add(newUsername, user.confidence, true)

        this.hash.set(newUsername, img) // maybe don't replace old one?
    }

    // TODO: Move to constants
    USERNAME_BOX_HEIGHT_PCT  = ((185+1) - 152) / 1080; // username max box height
    // USERNAME_BOX_HEIGHT = ((185+1) - 152) / 1080
    OCR_SCALE_RATIO = 1000 / 547;
    USERNAME_FULL_BOX_HEIGHT_PCT = (1080-154)/1080
    USERNAME_BOX_CROP_PCT = this.USERNAME_BOX_HEIGHT_PCT / this.USERNAME_FULL_BOX_HEIGHT_PCT

    MIN_PAGE_CHECK = 1  // At least # usernames must exist for this page to be checked

    static USER_IMG_LIMIT = 3

    /**
     * Add a page of usernames (including scrubbing to check which line is which)
     * While this function is async, it's not expected to be run as such.
     * @param {Object} tesseractData // contains .lines & .bbox of tesseract info
     * @param {sharp} sharpOCRImg  Sharp imagelike, Cropped Username image BUT scaled to OCR size
     * @param {import("./ImageModule.mjs").RectObj} orig_img_size Image_size of the original cropped image to bypass metadata issues
     * @returns {Array[String]} retList
     */
    addPage (tesseractData, sharpOCRImg, orig_img_size, capture_dt) {
        const retList = []  // List of names to return for state info
        
        const HEIGHT_PADDING = 13; // TODO: Turn into pct
        if (!tesseractData.lines) return retList
        
        const validLines = tesseractData.lines.filter( line => line.text.length > 2)
        if (validLines.length <= this.MIN_PAGE_CHECK) {
            console.warn(`Discard, not enough usernames found. ${validLines.length}`)
            return retList
        }

        const OCR_SCALE_RATIO = UserNameBinarization.OCR_WIDTH / UserNameBinarization.NAME_CROP_RECT.w;
        /** This will be the trueUsernameHeight thanks to res_basis */
        const OCR_RES_BASIS = new PixelMeasure(
            PixelMeasure.MEASURE_WIDTH * OCR_SCALE_RATIO, 
            PixelMeasure.MEASURE_HEIGHT * OCR_SCALE_RATIO
        );
        const USERNAME_OCR_BOX_HEIGHT = OCR_RES_BASIS.getVerticalUnits(
            UserNameBinarization.USERNAME_HEIGHT, {floor:true});
        const OCR_IMG_HEIGHT = OCR_RES_BASIS.getVerticalUnits(orig_img_size.h, {floor:true});
        const OCR_IMG_WIDTH = OCR_RES_BASIS.getHorizUnits(orig_img_size.w, {floor:true})

        /** height of the OCR binarized buffer */
        // const ocrImgHeight = Math.floor(OCR_SCALE_RATIO * orig_img_size.h); // sharp.scale is not reflected in this buffer.
        /** width of the OCR binarized buffer */
        // const ocrImgWidth = Math.floor(OCR_SCALE_RATIO * orig_img_size.w); // sharp.scale is not reflected in this buffer.
        /** @type {Object<string, int>} pageData #. {user:string, idx:int} */
        const pageData = []
        /** @type {Object[]} Current page username objects */
        const pageParsedInfo = []

        // 2X lines per image is expected - UI changed
        for (let line of tesseractData.lines) {
            const username = line.text.trim()
            if (username == '') continue    // Ignore empty lines

            // Determine pageData info: location where the username was read & save 
            /** Get vertical center of username box */
            const username_box_center = (line.bbox.y1 - line.bbox.y0)/2 + line.bbox.y0
            /** Division in OCR Image bounds that matches the user lines */
            const division = Math.floor(username_box_center / (USERNAME_OCR_BOX_HEIGHT))  
            pageData.push({"username":username, "division":division}) // set the current division

            const validUsername = username.length > 2;
            if (validUsername) { // Re-calc confidence then add to hash+list
                let conf = line.confidence
                if (line.confidence == 0) { // line -> word -> symbol to recalc confidence
                    const symbolSum = line.words[0].symbols.reduce( (acc,b) => acc+b.confidence, 0)
                    conf = symbolSum / (2 * line.words[0].symbols.length)
                }
                pageParsedInfo[division] = {'username':username, 'conf':conf, 
                    'division':division, 'capture_dt':capture_dt, 'bbox':line.bbox,
                    'line':line}
                
                retList.push(`[${division}]${username}, ${conf}`)
            
                // Extract the image
                // const bbox = line.bbox
                // pageParsedInfo[division]['imgPromise'] = // set image buffer promise to be made after
                //     sharpOCRImg.extract({  left: 0,
                //                         width: OCR_IMG_WIDTH,
                //                         top: Math.max(bbox.y0 - HEIGHT_PADDING, 0),
                //                         height: Math.min((bbox.y1+HEIGHT_PADDING) - bbox.y0, OCR_IMG_HEIGHT)
                //     })
                //     .jpeg().toBuffer()
                //     .catch( err => { console.warn(`Couldn't retrieve image buffer ${err}`)})
            }
            // NOTE: Ditch name if invalid? I assume that the incomplete text cant be matched to alias to help here
        }

        // take the first line, try to match to previous page
        /** best-match within leven distance of # */
        const MIN_MATCH = 4;
        /** number of links required before joining pages */
        const LINK_AMOUNT = 3
        /** where currPage points to prev page */
        const linkUp = {}
        /** Current line idx being checked */
        let pageDataLineIdx = 0
        /** final answer of link offset to previous page */
        let linkAnswer = null
        
        // NOTE: Push this to async maybe
        // Match at least LINK_AMOUNT until the pages line up
        while (this.lastPage.length > 0 && pageDataLineIdx < pageData.length) {
            let lowestMatch = {name: null, match: MIN_MATCH, division: null}    // lowest leven match
            const lineCheck = pageData.at(pageDataLineIdx++)    // line being checked
            const checkUsername = lineCheck['username']

            for (const lastUser of this.lastPage) {    // loop will not run if lastPage is empty
                const {username, division} = lastUser
                
                let dist = this.calcLevenDistance(checkUsername, username, lowestMatch.match, true)
                if (dist < lowestMatch.match)
                    lowestMatch = {name: username, match: dist, division: division}
            }

            if (lowestMatch.name) {
                const lineDivision = lineCheck['division']
                // console.warn(`Matched ${checkUsername}[${lineDivision}] to ${lowestMatch.name}[${lowestMatch.division}] prev`)

                const divisionOffset = lowestMatch.division - lineDivision
                linkUp[divisionOffset] = (linkUp[divisionOffset] ?? 0) + 1

                if (linkUp[divisionOffset] >= LINK_AMOUNT) {
                    linkAnswer = divisionOffset
                    break // break outer loop
                }
            }
        }

        let startIndex = this.usersInOrder.length   // Offset to full user list

        // Stitch pages together
        if (linkAnswer != null) { 
            console.warn(`Page Match lines by ${linkAnswer}. Joining pages.`)
            startIndex -= (this.lastPage.at(-1).division+1 - linkAnswer)
        } else { // Add pages together
            let result_text = (this.lastPage.length > 0) ? `${this.lastPage.map( line => line.username)}` : `{empty list}`
            console.error(`No page match for \nLAST:\t${result_text}\nCURR:\t${pageData.map( line => line.username)} `)
        }

        const currPageIdx = this.pageIdx+1;

        // Add users to list & Get image promises (including skipped divisions)
        for (let i=0; i<pageParsedInfo.length; i++) {
            const userInfo = pageParsedInfo.at(i)
            const nextImgIdx = this.fullImageList.push([]) - 1
            const division = i

            /** sharp extracted username image */
            let imgExtract = null;
            // add image (even if no text was found) from division based on height/width
            if (userInfo == undefined) {
                imgExtract = sharpOCRImg.extract({  left: 0,    width: OCR_IMG_WIDTH,
                    top: Math.floor(division * USERNAME_OCR_BOX_HEIGHT),
                    height: Math.floor(USERNAME_OCR_BOX_HEIGHT)
                })
            } else {
                // else grab image promise while adding user
                const userObj = this.add(userInfo.username, userInfo.conf, 
                    startIndex + userInfo.division, userInfo.capture_dt);
                if (userObj.fullImgIdxList.length < UsernameTracker.USER_IMG_LIMIT || userInfo.conf >= userObj.confidence) {
                    const bbox = userInfo.bbox
                    imgExtract = sharpOCRImg.extract({  left: 0,
                        width: OCR_IMG_WIDTH,
                        top: Math.max(bbox.y0 - HEIGHT_PADDING, 0),
                        height: Math.min((bbox.y1+HEIGHT_PADDING) - bbox.y0, OCR_IMG_HEIGHT)
                    })
                }
            }

            imgExtract
            ?.jpeg().toBuffer()
            .catch( err => { console.warn(`Couldn't retrieve image buffer ${err}`)})
            // add image to usernameTracker object
            .then( imgBuffer => {
                this.addImage(currPageIdx, division, imgBuffer, startIndex + division, nextImgIdx)
                if (userInfo) {
                    const userObj = this.usersInOrder[startIndex+division]
                    // swap if higher confidence
                    if (userObj && userObj.fullImgIdxList.length > 1 
                        && userInfo.conf >= userObj.confidence) {
                            const swap = userObj.fullImgIdxList.pop()
                            userObj.fullImgIdxList.shift(swap)
                    }
                    while (userObj && userObj.fullImgIdxList.length > UsernameTracker.USER_IMG_LIMIT) {
                        const delImgIdx = userObj.fullImgIdxList.pop();
                        this.removeImage(delImgIdx, userObj)
                    }
                }
              } // end of promise
            )
        }

        this.lastPage = pageData // set page
        this.pageIdx += 1   // Increment page
        
        return retList
    }

    /**
     * Add image to object, link to username object (if exists)
     * @param {number} pageIdx 
     * @param {number} division 
     * @param {import("tesseract.js").ImageLike} imgBuffer 
     * @param {number} userIdx 
     * @param {number} fullImgIdx 
     */
    addImage (pageIdx, division, imgBuffer, userIdx, fullImgIdx) {
        
        const userObj = this.usersInOrder.at(userIdx)
        const newImg = new UserImage(pageIdx, division, imgBuffer, userObj)
        
        this.fullImageList[fullImgIdx] = newImg

        if (userObj) 
            userObj.fullImgIdxList.push(fullImgIdx)
    }
    
    /** DEPRECATED 
     * @deprecated
    */
    addImageOld(username, imgBuffer, fullImgIdx) {
        const newImg = new UserImage(this.pageIdx, imgBuffer, null)
        this.fullImageList[fullImgIdx] = newImg

        const userObj = this.hash.get(username)
        if (!userObj) { // Add for user identification
            this.unverifiedImgs.push(imgBuffer)
        } else if (userObj.verifyAmount < 2) {
            // else add to imgHash & add to unverified user
            userObj.fullImgIdxList.push(fullImgIdx)
            this.unverifiedUsers.push(userObj)
        } else {
            userObj.fullImgIdxList.push(fullImgIdx)
        }
    }

    /** Remove image from fullImgList
     * Assumes image has been removed from userObj, this is simply for debug
     */
    removeImage(fullImgIdx, userObj) {

        const imgObj = this.fullImageList.at(fullImgIdx);
        this.fullImageList[fullImgIdx] = null;
    }

    clear () {
        this.pageIdx = 0
        this.hash.clear()

        this.usersInOrder = []

        this.unverifiedImgs = []
        this.unverifiedUsers.clear()
        
        this.fullImageList = []
        this.lastPage = []
    }

    getImage(username) {
        // Return this image associated with this user
        
        if (this.hash.has(username)) {
            const userObj = this.hash.get(username)
            const imgObj = this.fullImageList[userObj.fullImgIdxList[0]] // Return random?
            // console.warn(userObj.fullImgIdxList)
            // console.warn(userObj.fullImgIdxList.map(val => this.fullImageList[val]))
            // console.warn(`Got image from P:${imgObj.pageIdx} D:${imgObj.division}`)
            return imgObj.imgBuffer
        }
        return null
    }

    getFullImageLength () {
        // Return length of images
        return this.fullImageList.length
    }

    getImageFromFullList (idx) {
        if (idx < this.fullImageList.length)
            return this.fullImageList[idx].imgBuffer
        else
            return null
    }


    status () {
        // Return status for server debug
        return {
            'user_list': this.usersInOrder.length,
            'full_img_list': this.fullImageList.length,
            'read_pages': this.pageIdx,
            'unverifed': {
                'users': this.unverifiedUsers.size,
                'img': this.unverifiedImgs.length
            }
        }
    }

    PERFORMANCE_MARK_FIND = "find_username"
    USER_RANK_LIST = 10

    /**
     * 
     * @param {String} searchUsername 
     * @param {Number} lowestRank 
     * @returns {LimitedList} 
     */
    find (searchUsername, lowestRank=Infinity, lowerCasePenalty=true) {
        // Attempt to find the 5 closest usernames to this text
        const sort = (a,b) => a[0] < b[0]
        const usernameRanking = new LimitedList(this.USER_RANK_LIST, null, sort)
        let currentMax = lowestRank
        performance.mark(this.PERFORMANCE_MARK_FIND)

        for (const userObj of this.usersInOrder) {
            if (!userObj) continue
            for (const userAlias of userObj.aliases) {
                const testUsername = userAlias
                let dist = this.calcLevenDistance(searchUsername, testUsername, currentMax, lowerCasePenalty)
                const userRankObj = [dist, userObj]

                if (usernameRanking.isFull()) currentMax = usernameRanking.sneak()[0]
                if (dist < currentMax) usernameRanking.push(userRankObj)
            }
        }

        // console.debug(`Find username ranking took ${performance.measure('username_mark', this.PERFORMANCE_MARK_FIND).duration.toFixed(2)}ms`)
        return usernameRanking.list
    }

    /**
     * Returns the Leven Distance between two strings
     * @param {string} newUsername 
     * @param {string} oldUsername 
     * @param {Number} earlyOut 
     * @returns {Number}
     */
    calcLevenDistance (newUsername, oldUsername, earlyOut=Infinity, lowerCasePenalty=true) {
        // Return the distance between the two usernames
        const flatArray = new Uint8Array((newUsername.length+1) * (oldUsername.length+1))
        let getOffset = (x,y) => y*(newUsername.length+1) + x

        const del_add_penalty = 2
        for (let x=0; x < newUsername.length+1; x++) {
            flatArray[getOffset(x,0)] = x * del_add_penalty
        }
        for (let y=1; y < oldUsername.length+1; y++) {
            flatArray[getOffset(0,y)] = y * del_add_penalty
        }

        // start DP iteration
        // NOTES: If I want to penalize insertion/deletion, increase cost for left/up movement
        for (let x=1; x<newUsername.length+1; x++) {
            for (let y=1; y<oldUsername.length+1; y++) {
                const penalty = this.compareLetters(newUsername[x-1], oldUsername[y-1], lowerCasePenalty)
                // const penalty = newUsername[x-1] == oldUsername[y-1] ? 0 : 1
                const trip = Math.min(
                                flatArray[getOffset(x-1, y)], 
                                flatArray[getOffset(x-1, y-1)], 
                                flatArray[getOffset(x,   y-1)])
                flatArray[getOffset(x,y)] = penalty + trip
                
                if (x == y && flatArray[getOffset(x,y)] > earlyOut) return Infinity // early out
            }
        }

        return flatArray[getOffset(newUsername.length, oldUsername.length)]

    }


    calcMatchDistance (matchUsername, checkUsername) {
        // fuzzy match
        let score = 0
        let lastMatchIdx = null
        // let matchBin = 0

        let ltMap = new Map()
        for (let lt_idx in checkUsername) {
            let lt = checkUsername[lt_idx]
            
            if (!ltMap.has(lt)) ltMap.set(lt, [])
            ltMap.get(lt).push(parseInt(lt_idx))
        }

        for (let lt of matchUsername) {
            if (ltMap.has(lt)) {
                score += -1
                let lt_pos = ltMap.get(lt).shift()
                if (lastMatchIdx) {
                    score += Math.abs(lastMatchIdx + 1 - lt_pos)
                }
                lastMatchIdx = lt_pos
                if (ltMap.length == 0) ltMap.delete(lt)
            } else {
                score += 2
            }
        }

        return score
    }

    compareLetters(ltA, ltB, lowerCasePenalty=true) {
        
        if (ltA == ltB) return 0
        if (ltA.toLowerCase() == ltB.toLowerCase()) return lowerCasePenalty ? 1 : 0
        
        if ( ADJC_LETTER_MAP.has(ltA) ) {
            const adjcSet = ADJC_LETTER_MAP.get(ltA)
            if (adjcSet.has(ltB)) return 1
        }
        return 2
    }
}

/**
 * Represents a TrackedUsername in the list of usernames shown
 */
export class TrackedUsername {
    /**
     * Store info about the Username and etc
     * @param {String} name Username string
     * @param {number} confidence Confidence in OCR
     * @param {number} index Index in the full 1000 list
     * @param {number} enterFrameTime Ingest date
     * @param {Date} endTs Ingest date
     */
    constructor (enterFrameTime=undefined) {
        /** @type {string} most confident name */
        this.name = null                
        /** @type {number} approx length of the username, negative */
        this.length = null
        /** @type {number} confidence percentage */
        this.confidence = 0
        /** @type {number} index in user list */
        this.index = null

        /** Colorspace color detected for this user */
        this.color = null

        /** @type {boolean} has the username been seen */
        this.seen = false;

        /** @type {boolean} OCR in progress */
        this.ocr_processing = false;

        /** @type {number} ingest timestamp in ms */
        this.enterFrameTime = enterFrameTime
        // this.exitFrameTime = undefined
        this.debugExitFrame = null

        /** @type {number} Time taken to recognize the name */
        this.ocr_time = null

        /** @type {ArrayBuffer[]} jpg buffer image of the user */
        this.partialImgList = []

        /** @type {ArrayBuffer} Image to display to user */
        this.bestImg = null

        /** @type {Set<string>} set of usernames that are at this index */
        this.aliases = new Set()
    }

    /** 
     * @returns {number} Time that username should be offscreen
     */
    get exitFrameTime () {
        if (!this.enterFrameTime) return undefined
        return this.enterFrameTime + UsernameAllTracker.FinishExitTime
    }

    /*
    TrackerUsername has 3 states
    1. Pre-screen                   - no appeartime
    2. On screen, unknown length    - appeartime
    3. On screen, length known      - appearTime & seen
    3.a (going off-screen), this might take some testing    - exitingTime*
    4. Off screen - endTime
    */

    /** 
     * @returns {number} Time that username right-line stops being visible
     */
    get exitingFrameTime () {
        if (!this.enterFrameTime) return undefined
        return this.enterFrameTime + UsernameAllTracker.BeginExitTime
    }

    set exitingFrameTime (time) {
        // TODO: Set the enteringFrameTime
        // also should have some flag to confirm if this is top of frame disappear or overlay disappear
        this.debugExitFrame = time
    }


    /**
     * Return if userbox is expected to be on-screen.
     * This is true if endFrameTime is past currentTime
     * @param {number} currFrameTime 
     */
    onScreen (currFrameTime) {
        return (this.exitFrameTime && this.exitFrameTime > currFrameTime)
    }


    static LENGTH_MIN = 3;
    /**
     * Helper function to match length within a range
     * @param {number} inputLen 
     */
    matchLen (inputLen) {
        if (this.length == null) return false;
        
        return inRange(inputLen, this.length, 
            [-TrackedUsername.LENGTH_MIN, TrackedUsername.LENGTH_MIN])
    }

    /**
     * Helper function to set length; ignored if positive, null/undefined
     * @param {number} inputLen 
     */
    setLen(inputLen) {
        if (inputLen == null || inputLen === undefined) 
            return // I know JS considers this the same, but I don't so
        
        if (inputLen >= 0) {
            throw Error(`Given a negative length ${inputLen}`)
        }

        this.length = inputLen
    }

    setColor(color) {
        if (color == null || color == undefined)
            return

        this.color = color
    }

    get lengthUnknown () {
        return this.length === null
    }

    /**
     * Get if length is a valid value
     */
    get validLength () {
        return this.length < 0
    }

    /**
     * Add new image to the user
     * @param {Buffer} jpgBuffer 
     * @param {string} name 
     * @param {number} confidence 
     */
    addImage (jpgBuffer, name, confidence) {
        this.partialImgList.push(jpgBuffer)

        if (confidence > this.confidence) {
            // Update name and best Img
            this.name = name
            this.confidence = confidence
            this.bestImg = jpgBuffer
        }
        if (name != null)
            this.aliases.add(name)
    }

    /** Determine if user has an image */
    get hasImageAvailable() {
        return this.partialImgList.length > 0
    }

    /**
     * Checks if user is available for OCR processing
     * User must 
     *      have length
     *      not already have OCR ongoing
     *      low confidence
     */
    get readyForOCR () {
        return (
            this.length != null &&
            this.ocr_processing == false &&
            this.confidence < 85
        )
    }

    toJSON () {
        return {
            name: this.name,
            len: this.length,
            index: this.index,
            conf: this.confidence,
            aliases: Array.from(this.aliases.keys()),
            enterTime: this.enterFrameTime,
            // exitingTime: this?.debugexitFrame
            debugExitTime: this.debugExitFrame,
            timeOnScreen: (this.debugExitFrame ?? Infinity) - this.enterFrameTime,
            img_files: this.partialImgList.length
        }
    }
}


/**
 * Class representing a username that's visually on the screen
 * Stores the visual (onscreen) index and information about the username
 */
export class VisualUsername {

    constructor(visual_index, appear, length=undefined) {
        /** @type {number} Visual index on this frame */
        this.vidx = visual_index
        /** @type {boolean} did username appear this frame (rightLine detection) */
        this.appear = appear
        /** 
         * @type {number} length this frame (left edge detection) 
         * if undefined, length was not checked.
         * if null, length checked but not found.
         * if negative, valid value.
        */
        this.length = length

        /**
         * Colorspace color detected for this user
         */
        this.color = null

        /** debug object for tracking some things */
        this.debug = {
            /** length matched  */
            matchLen: false,
            /** length checked during unknown length check */
            unknownLen: false,
            /** length checked during OCR */
            ocrLen: false,
            /** length checked during quickLength phase */
            qlLen: false,
        }
    }

    get validLength () {
        return this.length != null
    }

    /**
     * Was length checked and not found this frame
     */
    get lenUnavailable () {
        return this.length === null
    }

    /**
     * Was length checked this frame
     */
    get lenUnchecked () {
        return this.length === undefined
    }
}