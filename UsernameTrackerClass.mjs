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

        // this.image = null

        // this.nextAlias = null
        // this.prevAlias = null
        this.aliases = [] // list of usernames that are similar
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
        this.hash = new Map()
        // this.list = [] // ordered list
        this.imgHash = new Map()
    }

    // *[Symbol.iterator] () {
    //     yield this.hash.entries()
    // }

    get length () {
        return this.hash.size
    }

    add (username, confidence) {
        let userObj = this.hash.get(username)
        if (userObj == undefined) {
            userObj = new Username(username, confidence)
            // userObj.index = this.list.push(userObj)
            this.hash.set(username, userObj)
        } 
        else // update confidence
            userObj.confidence = Math.max(confidence, userObj.confidence)
        
        return userObj
    }

    addAll (tesseractData, sharpImg) {
        const retList = []
        for (let line of tesseractData.lines) {
            let username = line.text.trim()
            if (username != '' && username.length > 2) {
                // TODO: Check for aliases
                const userObj = this.add(username, line.confidence)
                if (line.confidence == 0) { 
                    // line -> word -> symbol
                    const symbolSum = line.words[0].symbols.reduce( (acc,b) => acc+b.confidence, 0)
                    userObj.confidence = symbolSum / (2 * line.words[0].symbols.length)
                }
                
                const bbox = line.bbox
                // NOTE: Hard coded values
                const fullWord = {x0: 0, width: 1000}

                // sharpImg.extract({left: bbox.x0, width: bbox.x1-bbox.x0, top:bbox.y0, height: bbox.y1-bbox.y0}).jpeg().toBuffer()
                sharpImg.extract({left: fullWord.x0, width: fullWord.width, top:bbox.y0, height: bbox.y1-bbox.y0}).jpeg().toBuffer()
                .then( imgBuffer => {
                    this.imgHash.set(username, imgBuffer)
                }).catch( err => {
                    console.warn(`Unable to set user image buffer ${err}`)
                })
                
                retList.push(`${username}, ${userObj.confidence}`)
            }
        }
        return retList
    }

    remove(username) {
        if (!this.hash.has(username)) return False
        
        const user = this.hash.get(username)
        this.hash.delete(username)
        // this.list.pop(user.index)
    }

    clear () {
        this.hash.clear()
        // this.list.length = 0
    }



    getImage(username) {
        // Return this image associated with this user
        if (this.hash.has(username)) {
            return this.imgHash.get(username)
        }
        return null
    }

    PERFORMANCE_MARK_FIND = "find_username"
    USER_RANK_LIST = 10
    find (searchUsername) {
        // Attempt to find the 5 closest usernames to this text
        const sort = (a,b) => a[0] < b[0]
        const usernameRanking = new LimitedList(this.USER_RANK_LIST, null, sort)
        let currentMax = Infinity
        performance.mark(this.PERFORMANCE_MARK_FIND)

        for (const userObj of this.hash.values()) {
            const testUsername = userObj.name
            let dist = this.calcLevenDistance(searchUsername, testUsername, currentMax)
            const userRankObj = [dist, userObj]

            if (usernameRanking.isFull()) currentMax = usernameRanking.sneak()[0]
            if (dist < currentMax) usernameRanking.push(userRankObj)
        }

        console.debug(`Find username ranking took ${performance.measure('username_mark', this.PERFORMANCE_MARK_FIND).duration.toFixed(2)}ms`)
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
