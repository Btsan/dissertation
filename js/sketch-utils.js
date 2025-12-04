/**
 * Sketch Utilities
 * Shared logic for sketching visualizations.
 */

/**
 * Returns the minimal set of dyadic intervals covering [a, b] within domain [0, n-1].
 * @param {number} a - Start of range
 * @param {number} b - End of range
 * @param {number} n - Domain size (power of 2, e.g., 16 or 32)
 * @returns {Array<[number, number]>} Array of [start, end] intervals
 */
function minimalDyadicCover(a, b, n) {
    const intervals = [];

    function recurse(l, r) {
        // If the current interval [l, r] is completely outside the query range [a, b], stop.
        if (l > b || r < a) return;

        // If the current interval [l, r] is completely inside the query range [a, b], add it.
        if (l >= a && r <= b) {
            intervals.push([l, r]);
            return;
        }

        // Otherwise, split and recurse.
        const mid = l + Math.floor((r - l) / 2);
        recurse(l, mid);
        recurse(mid + 1, r);
    }

    recurse(0, n - 1);
    return intervals;
}



/**
 * Fast-AGMS Sketch Implementation
 * Uses K-wise independent hashing to estimate frequency moments and join sizes.
 */
class FastAGMS {
    /**
     * @param {number} depth - Number of rows (hash functions)
     * @param {number} width - Number of columns (buckets)
     * @param {number} seed - Random seed
     */
    constructor(depth, width, seed = 123) {
        this.depth = depth;
        this.width = width;
        this.grid = [];

        // Initialize grid with zeros
        for (let r = 0; r < depth; r++) {
            this.grid[r] = new Array(width).fill(0);
        }

        // Initialize hash functions
        // We assume KWiseHash is available globally (from kwisehash.js)
        if (typeof KWiseHash === 'undefined') {
            console.error("KWiseHash library not found. Make sure to include kwisehash.js");
            return;
        }

        this.hashes = {
            bin: new KWiseHash.BinHash(depth, width, 2, seed),
            sign: new KWiseHash.SignHash(depth, 4, seed)
        };
    }

    /**
     * Update the sketch with an item and weight
     * @param {number|string} item - Item to add
     * @param {number} weight - Weight to add (default 1)
     */
    update(item, weight = 1) {
        // Convert item to numeric ID if string
        const itemId = typeof item === 'string' ? item.charCodeAt(0) : item;

        for (let r = 0; r < this.depth; r++) {
            const col = this.hashes.bin.hash(itemId, r);
            const sign = this.hashes.sign.hash(itemId, r);
            this.grid[r][col] += sign * weight;
        }
    }

    /**
     * Query the estimated frequency of an item
     * @param {number|string} item - Item to query
     * @returns {number} Estimated frequency
     */
    query(item) {
        const itemId = typeof item === 'string' ? item.charCodeAt(0) : item;
        const estimates = [];

        for (let r = 0; r < this.depth; r++) {
            const col = this.hashes.bin.hash(itemId, r);
            const sign = this.hashes.sign.hash(itemId, r);
            estimates.push(this.grid[r][col] * sign);
        }

        estimates.sort((a, b) => a - b);
        return estimates[Math.floor(estimates.length / 2)];
    }

    /**
     * Compute the dot product with another sketch
     * @param {FastAGMS} otherSketch - Another FastAGMS sketch with same dimensions and seeds
     * @returns {number} Estimated dot product (join size)
     */
    dotProduct(otherSketch) {
        if (this.depth !== otherSketch.depth || this.width !== otherSketch.width) {
            throw new Error("Sketches must have same dimensions");
        }

        const rowEstimates = [];

        for (let r = 0; r < this.depth; r++) {
            let rowSum = 0;
            for (let c = 0; c < this.width; c++) {
                rowSum += this.grid[r][c] * otherSketch.grid[r][c];
            }
            rowEstimates.push(rowSum);
        }

        // Return median of row estimates
        rowEstimates.sort((a, b) => a - b);
        return rowEstimates[Math.floor(rowEstimates.length / 2)];
    }

    /**
     * Get the current grid state
     * @returns {Array<Array<number>>} The sketch grid
     */
    getGrid() {
        return this.grid;
    }
}

// Export for CommonJS if needed (for testing), otherwise it's a global in browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { minimalDyadicCover, FastAGMS };
} else if (typeof window !== 'undefined') {
    window.SketchUtils = { minimalDyadicCover, FastAGMS };
}
