/**
 * Simple FFT Library for Educational Demos
 * Implements Cooley-Tukey algorithm
 */

class Complex {
    constructor(re, im = 0) {
        this.re = re;
        this.im = im;
    }

    add(other) {
        return new Complex(this.re + other.re, this.im + other.im);
    }

    sub(other) {
        return new Complex(this.re - other.re, this.im - other.im);
    }

    mul(other) {
        return new Complex(
            this.re * other.re - this.im * other.im,
            this.re * other.im + this.im * other.re
        );
    }

    scale(scalar) {
        return new Complex(this.re * scalar, this.im * scalar);
    }

    conjugate() {
        return new Complex(this.re, -this.im);
    }
}

/**
 * Compute FFT of a signal
 * @param {Array<number|Complex>} input - Array of numbers or Complex objects
 * @returns {Array<Complex>} FFT result
 */
function fft(input) {
    const n = input.length;
    if (n <= 1) {
        return input.map(v => v instanceof Complex ? v : new Complex(v));
    }

    if ((n & (n - 1)) !== 0) {
        throw new Error("FFT length must be power of 2");
    }

    const even = fft(input.filter((_, i) => i % 2 === 0));
    const odd = fft(input.filter((_, i) => i % 2 !== 0));

    const result = new Array(n);
    for (let k = 0; k < n / 2; k++) {
        const angle = -2 * Math.PI * k / n;
        const w = new Complex(Math.cos(angle), Math.sin(angle));
        const t = w.mul(odd[k]);

        result[k] = even[k].add(t);
        result[k + n / 2] = even[k].sub(t);
    }

    return result;
}

/**
 * Compute Inverse FFT
 * @param {Array<Complex>} input - Frequency domain signal
 * @returns {Array<Complex>} Time domain signal
 */
function ifft(input) {
    const n = input.length;

    // Conjugate input
    const conjInput = input.map(c => c.conjugate());

    // Forward FFT
    const f = fft(conjInput);

    // Conjugate again and scale
    return f.map(c => c.conjugate().scale(1 / n));
}

// Export for browser
if (typeof window !== 'undefined') {
    window.FFT = {
        Complex,
        fft,
        ifft
    };
}
