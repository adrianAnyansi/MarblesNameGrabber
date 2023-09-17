// Class to track and retrieve usernames
// And cause the "server" code is getting too cluttered

// export default {UsernameTracker, Heap}
// export {UsernameTracker, Heap}

import { LimitedList } from "./DataStructureModule.mjs"

class Username {
    constructor (name, confidence, timestamp=null) {
        this.name = name
        this.confidence = confidence
        // this.index = index
        
        this.timestamp = timestamp
        this.verifyAmount = 0
        this.fullImgIdxList = [] // list of idxes that are this user

        this.aliases = [] // list of usernames that are similar
    }
}

class UserImage {
    constructor (imageIdx, buffer, userObj) {
        this.imageIdx = imageIdx
        this.imgBuffer = buffer
        this.userObj = userObj
    }
}


const DEFINED_ADJC_SETS = [
    ['o', 'O', '0', 'n'],               // o & rounded set
    ['i', 't', 'r', 'n'],               // r set (flick on r is hard to capture)
    ['i', 'l', '|', 'f', 'L', '1'],     // long char set
    ['a', 'e', 's', 'o', 'g'],          // a set
    ['e', 'c', 'u', 'w'],            // e & curved lt set
    ['o', 'c'],
    ['a', '8', 'B'],    // 8 set
    ['s', 'z'],                 // zigzag lt
    ['R', 'A'],             // Big lt with circle
    ['Y', 'v', 'y'],         // v/w
    ['4', 'd', 'A'],
    ['d', '9'],
    ['7', 'T'],
    ['g', 'y']
]
const ADJC_LETTER_MAP = new Map()

for (let arr of DEFINED_ADJC_SETS) {
    let set = new Set(arr)
    for (let lt of arr) {
        let currSet = ADJC_LETTER_MAP.get(lt)
        if (currSet == undefined) ADJC_LETTER_MAP.set(lt, set)
        else { // create new set and combine
            const combSet = new Set(set)
            for (const el in currSet) combSet.add(el)
            ADJC_LETTER_MAP.set(lt, combSet)
        }
    }
}

console.debug(`[UsernameTracker] Generated ${ADJC_LETTER_MAP.size} adjacent entries!`)



export class UsernameTracker {

    constructor () {
        this.hash = new Map()       // hash of names
        this.imgHash = new Map()    // hash of jpgs

        this.pageIdx = 0           // Currently injested images
        this.unqImageID = 0         // Unique id
        this.unverifiedImgs = []    // List of usernames unsuccessfully read
        this.unverifiedUsers = []   // Users yet to be verified
        this.fullImageList = []     // All images in order
    }

    // *[Symbol.iterator] () {
    //     yield this.hash.entries()
    // }

    get length () {
        return this.hash.size
    }

    add (username, confidence, userVerify=false) {
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

        const img = this.imgHash.get(oldUsername)
        // this.imgHash.delete(oldUsername)
        this.hash.set(newUsername, img) // maybe don't replace old one?
    }

    addPage (tesseractData, sharpImg, curr_ts) {
        const retList = []
        // const curr_ts = Date.now()
        const fullUsername = {x0: 0, width: 1000}   // NOTE: Hardcoded
        const heightPadding = 10;

        if (tesseractData.lines < 4) {
            console.warn(`Discard, not enough usernames found. ${tesseractData.lines}`)
        }

        // 27 lines per image is expected

        for (let line of tesseractData.lines) {
            const username = line.text.trim()
            const validUsername = username != '' && username.length > 2

            if (username == '') continue    // Ignore empty lines

            if (validUsername) {
                const userObj = this.add(username, line.confidence) // TODO: Add timestamp
                if (line.confidence == 0) { 
                    // line -> word -> symbol to recalc confidence
                    const symbolSum = line.words[0].symbols.reduce( (acc,b) => acc+b.confidence, 0)
                    userObj.confidence = symbolSum / (2 * line.words[0].symbols.length)
                }
                
                retList.push(`${username}, ${userObj.confidence}`)
            }
            
            const nextImgIdx = this.fullImageList.push([]) - 1
            // Add the image to hash
            const bbox = line.bbox
            sharpImg.extract({  left: fullUsername.x0, 
                                width: fullUsername.width, 
                                top: Math.max(bbox.y0 - heightPadding, 0), 
                                height: (bbox.y1+heightPadding) - bbox.y0 }) // TODO: Need image metadata
                                // height: Math.min(bbox.y1-bbox.y0+heightPadding, bbox.y1-bbox.y0)})
            .jpeg().toBuffer()
            .then( imgBuffer => {
                // const fullImgIdx = this.fullImageList.push(new UserImage(this.pageIdx, imgBuffer, null))
                this.addImage(username, imgBuffer, nextImgIdx)
                // this.fullImageList.push([this.imageIdx, imgBuffer, username])
            }).catch( err => {
                console.warn(`Unable to set image buffer ${err}`)
            })
        }

        // find unread images
        this.pageIdx += 1
        return retList
    }

    
    addImage(username, imgBuffer, fullImgIdx) {
        const newImg = new UserImage(this.pageIdx, imgBuffer, null)
        // const fullImgIdx = this.fullImageList.push(newImg)-1
        this.fullImageList[fullImgIdx] = newImg

        const userObj = this.hash.get(username)
        // this.unqImageID += 1
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

    clear () {
        this.hash.clear()
        this.imgHash.clear()
        this.unverifiedImgs = []
        this.unverifiedUsers = []
        this.fullImageList = []
    }

    getImage(username) {
        // Return this image associated with this user
        if (this.hash.has(username)) {
            const userObj = this.hash.get(username)
            const imgObj = this.fullImageList[userObj.fullImgIdxList[0]] // Return random?
            return imgObj.imgBuffer
            // return this.imgHash.get(username)
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
            'user_list': this.hash.size,
            'full_img_list': this.fullImageList.length,
            'read_pages': this.pageIdx,
            'unverifed': {
                'users': this.unverifiedUsers.length,
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
    find (searchUsername, lowestRank=Infinity) {
        // Attempt to find the 5 closest usernames to this text
        const sort = (a,b) => a[0] < b[0]
        const usernameRanking = new LimitedList(this.USER_RANK_LIST, null, sort)
        let currentMax = lowestRank
        performance.mark(this.PERFORMANCE_MARK_FIND)

        for (const userObj of this.hash.values()) {
            const testUsername = userObj.name
            let dist = this.calcLevenDistance(searchUsername, testUsername, currentMax)
            const userRankObj = [dist, userObj]

            if (usernameRanking.isFull()) currentMax = usernameRanking.sneak()[0]
            if (dist < currentMax) usernameRanking.push(userRankObj)
        }

        // console.debug(`Find username ranking took ${performance.measure('username_mark', this.PERFORMANCE_MARK_FIND).duration.toFixed(2)}ms`)
        return usernameRanking.list
    }

    calcLevenDistance (newUsername, oldUsername, earlyOut=Infinity) {
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
                const penalty = this.compareLetters(newUsername[x-1], oldUsername[y-1])
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

    compareLetters(ltA, ltB) {
        
        if (ltA == ltB) return 0
        if (ltA.toLowerCase() == ltB.toLowerCase()) return 1
        
        if ( ADJC_LETTER_MAP.has(ltA) ) {
            const adjcSet = ADJC_LETTER_MAP.get(ltA)
            if (adjcSet.has(ltB)) return 1
        }
        return 2
    }
}
