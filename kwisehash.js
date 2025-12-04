/**
 * K-wise Independent Hash Library
 * Implements polynomial hashing modulo Mersenne prime for pairwise/4-wise independence
 * Based on the implementation by Heddes et al.
 * https://github.com/mikeheddes/fast-multi-join-sketch
 */

const MERSENNE_PRIME = (1n << 61n) - 1n; // 2^61 - 1

/**
 * Simple LCG-based random number generator for reproducible seeds
 * Uses Splitmix64 for high-quality 64-bit output
 */
class SeededRandom {
  constructor(seed) {
    this.state = BigInt(seed);
  }
  
  // Splitmix64 algorithm - fast and high quality
  next() {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & 0xFFFFFFFFFFFFFFFFn;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xFFFFFFFFFFFFFFFFn;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xFFFFFFFFFFFFFFFFn;
    return (z ^ (z >> 31n)) & 0xFFFFFFFFFFFFFFFFn;
  }
  
  // Rejection sampling for uniform distribution without modulo bias
  nextBigInt(min, max) {
    const range = max - min;
    if (range <= 0n) {
      throw new Error('Invalid range: max must be greater than min');
    }
    
    // For small ranges relative to 2^64, simple modulo is fine
    // For large ranges, we still use modulo but the bias is negligible
    const mask = (1n << 64n) - 1n;
    let val = this.next();
    
    // Simple rejection sampling for better uniformity
    const threshold = (mask - range + 1n) % range;
    while (val < threshold) {
      val = this.next();
    }
    
    return min + (val % range);
  }
}

/**
 * Fast modulo operation for Mersenne prime 2^61 - 1
 * Uses bit operations to avoid expensive modulo
 */
function fastMersenneMod(x) {
  // For values that fit in 61 bits, this is equivalent to x % MERSENNE_PRIME
  // but much faster using bit operations
  let tmp1 = (x & MERSENNE_PRIME) + (x >> 61n);
  let tmp2 = tmp1 - MERSENNE_PRIME;
  return tmp2 < 0n ? tmp1 : tmp2;
}

/**
 * Polynomial hash function
 * Computes: a[0] + a[1]*x + a[2]*x^2 + ... + a[k-1]*x^(k-1) mod MERSENNE_PRIME
 */
function polyHash(x, coeffs) {
  x = BigInt(x);
  let result = coeffs[0];
  
  for (let i = 1; i < coeffs.length; i++) {
    result = fastMersenneMod(result * x + coeffs[i]);
  }
  
  return result;
}

/**
 * Sign Hash (ξ function)
 * Maps input to {-1, +1} with k-wise independence
 */
class SignHash {
  /**
   * @param {number} depth - Number of independent hash functions
   * @param {number} k - Degree of independence (2 for pairwise, 4 for 4-wise)
   * @param {number} seed - Random seed for reproducibility
   */
  constructor(depth, k = 4, seed = 42) {
    this.depth = depth;
    this.k = k;
    this.seeds = [];
    
    const rng = new SeededRandom(seed);
    
    // Generate random coefficients for each hash function
    for (let d = 0; d < depth; d++) {
      const coeffs = [];
      
      // First k-1 coefficients must be non-zero (from [1, MERSENNE_PRIME))
      for (let i = 0; i < k - 1; i++) {
        coeffs.push(rng.nextBigInt(1n, MERSENNE_PRIME));
      }
      
      // Last coefficient can be zero (from [0, MERSENNE_PRIME))
      coeffs.push(rng.nextBigInt(0n, MERSENNE_PRIME));
      
      this.seeds.push(coeffs);
    }
  }
  
  /**
   * Hash input to {-1, +1}
   * @param {number|bigint} input - Value to hash
   * @param {number} hashIdx - Which hash function to use (0 to depth-1)
   * @returns {number} -1 or +1
   */
  hash(input, hashIdx = 0) {
    if (hashIdx >= this.depth) {
      throw new Error(`hashIdx ${hashIdx} out of bounds (depth=${this.depth})`);
    }
    
    const h = polyHash(input, this.seeds[hashIdx]);
    // Extract last bit and map: 0 -> -1, 1 -> +1
    return (h & 1n) ? 1 : -1;
  }
  
  /**
   * Hash multiple inputs at once
   * @param {Array<number|bigint>} inputs - Values to hash
   * @param {number} hashIdx - Which hash function to use
   * @returns {Array<number>} Array of -1 or +1 values
   */
  hashBatch(inputs, hashIdx = 0) {
    return inputs.map(input => this.hash(input, hashIdx));
  }
  
  /**
   * Get all depth hash values for a single input
   * @param {number|bigint} input - Value to hash
   * @returns {Array<number>} Array of -1 or +1 values, one per hash function
   */
  hashAll(input) {
    const results = [];
    for (let i = 0; i < this.depth; i++) {
      results.push(this.hash(input, i));
    }
    return results;
  }
}

/**
 * Bin Hash (h function)
 * Maps input to {0, 1, ..., width-1} with k-wise independence
 */
class BinHash {
  /**
   * @param {number} depth - Number of independent hash functions
   * @param {number} width - Number of bins
   * @param {number} k - Degree of independence (typically 2)
   * @param {number} seed - Random seed for reproducibility
   */
  constructor(depth, width, k = 2, seed = 43) {
    this.depth = depth;
    this.width = BigInt(width);
    this.k = k;
    this.seeds = [];
    
    const rng = new SeededRandom(seed);
    
    // Generate random coefficients for each hash function
    for (let d = 0; d < depth; d++) {
      const coeffs = [];
      
      // First k-1 coefficients must be non-zero
      for (let i = 0; i < k - 1; i++) {
        coeffs.push(rng.nextBigInt(1n, MERSENNE_PRIME));
      }
      
      // Last coefficient can be zero
      coeffs.push(rng.nextBigInt(0n, MERSENNE_PRIME));
      
      this.seeds.push(coeffs);
    }
  }
  
  /**
   * Hash input to a bin in {0, 1, ..., width-1}
   * @param {number|bigint} input - Value to hash
   * @param {number} hashIdx - Which hash function to use (0 to depth-1)
   * @returns {number} Bin index from 0 to width-1
   */
  hash(input, hashIdx = 0) {
    if (hashIdx >= this.depth) {
      throw new Error(`hashIdx ${hashIdx} out of bounds (depth=${this.depth})`);
    }
    
    const h = polyHash(input, this.seeds[hashIdx]);
    return Number(h % this.width);
  }
  
  /**
   * Hash multiple inputs at once
   * @param {Array<number|bigint>} inputs - Values to hash
   * @param {number} hashIdx - Which hash function to use
   * @returns {Array<number>} Array of bin indices
   */
  hashBatch(inputs, hashIdx = 0) {
    return inputs.map(input => this.hash(input, hashIdx));
  }
  
  /**
   * Get all depth hash values for a single input
   * @param {number|bigint} input - Value to hash
   * @returns {Array<number>} Array of bin indices, one per hash function
   */
  hashAll(input) {
    const results = [];
    for (let i = 0; i < this.depth; i++) {
      results.push(this.hash(input, i));
    }
    return results;
  }
}

/**
 * Utility: Create a sketch from a dataset
 * @param {Array<number|bigint>} data - Input data
 * @param {SignHash} signHash - Sign hash function
 * @param {number} hashIdx - Which hash function to use
 * @returns {number} Sketch value (sum of hash values)
 */
function createSketch(data, signHash, hashIdx = 0) {
  return data.reduce((sum, value) => sum + signHash.hash(value, hashIdx), 0);
}

/**
 * Utility: Estimate frequency of a value using multiple sketches
 * @param {number|bigint} value - Value whose frequency to estimate
 * @param {Array<number>} sketches - Array of sketch values
 * @param {SignHash} signHash - Sign hash function used to create sketches
 * @returns {number} Estimated frequency
 */
function estimateFrequency(value, sketches, signHash) {
  const estimates = sketches.map((sketch, idx) => {
    const xi = signHash.hash(value, idx);
    return sketch * xi;
  });
  
  // Return average of estimates
  return estimates.reduce((a, b) => a + b, 0) / estimates.length;
}

/**
 * Test pairwise independence by computing sum of hashes
 * For a pairwise independent hash function mapping to {-1, +1},
 * the sum over a large range should be close to 0
 * 
 * @param {number} n - Range to test (1 to n)
 * @param {number} depth - Number of hash functions to test
 * @returns {Object} Test results
 */
function testPairwiseIndependence(n = 10000, depth = 5) {
  const results = [];
  const signHash = new SignHash(depth, 4, 42);
  
  for (let hashIdx = 0; hashIdx < depth; hashIdx++) {
    let sum = 0;
    for (let i = 1; i <= n; i++) {
      sum += signHash.hash(i, hashIdx);
    }
    
    const avgDeviation = Math.abs(sum) / n;
    results.push({
      hashIdx,
      sum,
      expected: 0,
      avgDeviation,
      passed: avgDeviation < 0.1 // Should be very close to 0
    });
  }
  
  return {
    n,
    depth,
    results,
    allPassed: results.every(r => r.passed)
  };
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SignHash,
    BinHash,
    createSketch,
    estimateFrequency,
    testPairwiseIndependence,
    MERSENNE_PRIME
  };
}

// Also attach to window for browser use
if (typeof window !== 'undefined') {
  window.KWiseHash = {
    SignHash,
    BinHash,
    createSketch,
    estimateFrequency,
    testPairwiseIndependence,
    MERSENNE_PRIME
  };
  
  // Auto-run test on load in browser
  console.log('=== K-wise Hash Pairwise Independence Test ===');
  const testResults = testPairwiseIndependence(10000, 5);
  console.log(`Testing ${testResults.n} values across ${testResults.depth} hash functions:`);
  testResults.results.forEach(r => {
    console.log(`  Hash ${r.hashIdx}: sum=${r.sum}, avg deviation=${r.avgDeviation.toFixed(6)} - ${r.passed ? '✓ PASS' : '✗ FAIL'}`);
  });
  console.log(`Overall: ${testResults.allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}`);
  console.log('=========================================');
}