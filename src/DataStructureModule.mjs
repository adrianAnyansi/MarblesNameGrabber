// Data structure class

/**
 * This is a list that only permits a max of N elements.
 * The elements are sorted as per LinkedList.
 * @template {any} T
 */
export class LimitedList {
    /** Default sort */
    static defaultASCSort (val1, val2) {
        return val1 < val2
    }
    static defaultDSCSort (val1, val2) {
        return val1 > val2
    }

    /**
     * @param {number} [limit=Infinity] Max size of list
     * @param {Array<T>} [values=null] initial list
     * @param {(val1: any, val2: any) => boolean} [sortMethod=LimitedList.defaultASCSort] sort function
     */
    constructor (limit=Infinity, values=null, sortMethod=LimitedList.defaultASCSort) {
        /**
         * @type {Array<T>} list of sorted objects 
         */
        this.list = []
        /** @type {number} max number of elements */
        this.maxLength = limit
        this.sortMethod = sortMethod ?? this.defaultASCSort

        if (values) {
            for (let value of values)
                this.push(value)
        }
    }

    /**
     * @param {T} value 
     */
    push(value) {
        this.list.push(value)
        this.sort()
        while (this.list.length > this.maxLength) 
            this.list.pop()
    }

    /**
     * sort function. private
     */
    sort() {
        // insertion sort which should work well for small-sorted arrays
        for (let i=1; i<this.list.length; i++) {
            const swapVal = this.list[i]
            let j=i;
            for (; j>0 && this.sortMethod(swapVal, this.list[j-1]); j--) {
                this.list[j] = this.list[j-1]
            }
            this.list[j] = swapVal
        }
    }

    /**
     * Look at first element in list without change
     * @returns {T} first el
     */
    peek() {
        return this.list[0]
    }

    /**
     * Look at last element in list without change
     * @returns {T} last element
     */
    sneak() {
        return this.list.at(-1)
    }

    /** @returns {boolean} is this list full */
    isFull() {
        return this.list.length == this.maxLength
    }
}

/**
 * @template {any} T
 * Single node of a LinkedList, intended to be used with LinkedList only
 */
export class LinkedListNode {
    /**
     * @param {T} value 
     * @param {LinkedListNode} prev
     */
    constructor(value, prev) {
        this.value = value
        this.next = null
        if (prev) prev.next = this
    }

    /**
     * @param {T} value 
     */
    static Create(value) {
        return new LinkedListNode(value)
    }
}

/**
 * @template {any} T
 * A sorted linked list
 */
export class LinkedList {

    static DSC = 'LinkedList_Descending'
    static ASC = 'LinkedList_Ascending'

    constructor(values, sortMethod, maxLen=Infinity) {
        this.root = null
        this.sortMethod = sortMethod
        this.maxLength = maxLen
        this.length = 0

        for (let val in values) {
            this.push(val)
        }
    }

    valCompare (val1, val2) {
        // For ASC, return True if val1 < val2
        // For DSC, return True if val2 < val1

        if (val1 == undefined) return false
        if (val2 == undefined) return true

        if (this.sortMethod == LinkedList.ASC) {
            return val1 < val2
        } else {
            return val1 > val2
        }
    }

    push(newVal) {
        // Add node to sorted LList
        let currLen = 0
        
        if (this.root == null) {
            this.root = new LinkedListNode(newVal)
            this.length = 1
            return this.root
        } else {
            let currNode = this.root
            while (this.valCompare(currNode.next?.value, newVal)) {
                currNode = currNode.next
                currLen += 1
            }

            if (currLen >= this.maxLength-1) return null // don't add
            // insert between nodes
            LinkedList.insertAfter(new LinkedListNode(newVal), currNode)
            this.length += 1

            // if overMaxLen, go to the end and pop last node
        }
    }

    pop() {
        // Return first node value
        let retVal = null
        if (this.root) {
            retVal = this.root.value
            this.root = this.root.next
        }
        return retVal
    }

    static insertAfter(insertNode, parentNode) {
        const tmp = parentNode.next
        parentNode.next = insertNode
        insertNode.next = tmp
    }
}

/**
 * This is not passing testing
 * Do not use until fixed
 * @deprecated
 */
export class Heap {
    // Thanks to https://stackfull.dev/heaps-in-javascript
    // Anish Kumar for this tutorial

    static MIN_HEAP = 'MIN_HEAP'
    static MAX_HEAP = 'MAX_HEAP'

    constructor (values=null, maxLength=Infinity, IsMinHeap=true) {
        this.heap = [] // Any type
        this._isMinHeap = IsMinHeap
        this.maxLength = maxLength
        this.intLength = 0

        if (values == null) return
        for (const value of values) {
            this.push(value)
        }
    }

    // helper functions
    _swapIndex(idxA, idxB) {
        [this.heap[idxA], this.heap[idxB]] = [this.heap[idxA], this.heap[idxB]]
    }
    static _getLeftIdx(idx) {
        return (2*idx+1)
    }
    static _getRightIdx(idx) {
        return (2*idx+2)
    }

    valCompare(val, val2) {
        if (this._isMinHeap) {
            return val < val2
        } else {
            return val > val2
        }
    }

    // heap functions
    push (value) {
        // Adds value to heap
        let currIdx = this.heap.push(value) - 1  // push key
        
        while (currIdx > 0) {
            const parentIdx = Math.floor((currIdx-1)/2)
            if ( this.valCompare(this.heap[currIdx], this.heap[parentIdx]) ) {
                this._swapIndex(currIdx, parentIdx)
                currIdx = parentIdx
            } else {
                break // dont swap, heap balanced
            }
        }

        while (this.length > this.maxLength)
            this.pop()
            // this.truncateLength(this.maxLength)
    }

    /**
     * Removes top-most value from heap 
     */
    pop () {
        this._swapIndex(0, this.heap.length-1) // swap to end
        const retVal = this.heap.pop() // get top of heap

        let checkIdx = 0
        // const checkVal = this.heap[checkIdx]

        while (Heap._getLeftIdx(checkIdx) < this.heap.length) {
            let swapIdx = Heap._getLeftIdx(checkIdx) // left always exist
            let swapVal = this.heap[swapIdx]

            const rIdx = Heap._getRightIdx(checkIdx)
            if (rIdx < this.heap.length && this.valCompare(this.heap[rIdx], swapVal)) {
                swapIdx = rIdx
                swapVal = this.heap[rIdx]
            }

            if (this.valCompare(this.heap[checkIdx], swapVal)) break

            // swap lower value
            this._swapIndex(checkIdx, swapIdx)
            checkIdx = swapIdx
        }

        return retVal
    }

    extend(...values) {
        // TODO: Implement and do length checks after   
    }

    peek () {
        // Return top value without popping
        return (this.heap.length > 0) ? this.heap[0] : null
    }

    sneak () {
        // Return bot value without popping
        // Based on length, we want max(values) > idx 2**(n-1)
        let currLen = this.heap.length;

        if (currLen == 0) return null
        if (currLen <= 1) return this.heap[0]

        let highestBit = -1
        while (currLen > 0) {
            currLen >>>= 1
            highestBit++
        }

        // Get all values greater than the bit
        let currMax = -1
        for (let b=2 ** (highestBit-1); b<this.heap.length; b++) {
            currMax = Math.max(currMax, this.heap[b])
        }
            
        return currMax
    }

    /**
     * @deprecated
     */
    truncateLength (maxLen) {

        return; // Algorithm is invalid
        
        
        // Remove values until heap is N length
        if (this.heap.length <= maxLen) return
        
        // first iterate til we're larger than length
        let iterTo = 0;
        let depth = 1;

        while (iterTo + depth <= maxLen) {
            iterTo += depth;
            depth <<= 1;
        }
        if (iterTo < maxLen) { // we need to squeeze lowest variables into here
            // sort k elements, gonna throw it into a heap
            const internalHeap = new Heap(null, Infinity)
            for (let i=iterTo; i<this.heap.length; i++)
                internalHeap.push(this.heap[i])
            
            for (let j=iterTo; j<maxLen; j++)
                this.heap[j] = internalHeap.pop()
        }
        
        this.heap.length = iterTo; // this is valid for Javascript
        
    }

    get length () {
        return this.heap.length
    }

    // set _isMinHeap (bool) {
    //     // NOTE: do nothing
    //     console.log("[heap] do nothin")
    // }

    changeHeapType() {
        // changes heap type
        throw EvalError('Method not yet implemented')
    }
}