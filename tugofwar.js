import React, { useState, useEffect, useMemo } from 'react';
import { Play, Pause, RotateCcw, SkipForward } from 'lucide-react';

// K-wise Independent Hash Implementation
const MERSENNE_PRIME = (1n << 61n) - 1n;

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

function fastMersenneMod(x) {
  let tmp1 = (x & MERSENNE_PRIME) + (x >> 61n);
  let tmp2 = tmp1 - MERSENNE_PRIME;
  return tmp2 < 0n ? tmp1 : tmp2;
}

function polyHash(x, coeffs) {
  x = BigInt(x);
  let result = coeffs[0];
  
  for (let i = 1; i < coeffs.length; i++) {
    result = fastMersenneMod(result * x + coeffs[i]);
  }
  
  return result;
}

class SignHash {
  constructor(depth, k = 4, seed = 42) {
    this.depth = depth;
    this.k = k;
    this.seeds = [];
    
    const rng = new SeededRandom(seed);
    
    for (let d = 0; d < depth; d++) {
      const coeffs = [];
      for (let i = 0; i < k - 1; i++) {
        coeffs.push(rng.nextBigInt(1n, MERSENNE_PRIME));
      }
      coeffs.push(rng.nextBigInt(0n, MERSENNE_PRIME));
      this.seeds.push(coeffs);
    }
  }
  
  hash(input, hashIdx = 0) {
    const h = polyHash(input, this.seeds[hashIdx]);
    return (h & 1n) ? 1 : -1;
  }
}

const TugOfWarVisualization = () => {
  const [rounds, setRounds] = useState([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [numRounds, setNumRounds] = useState(100);
  const [speed, setSpeed] = useState(0.3);
  const [animationPhase, setAnimationPhase] = useState('stack');
  
  const colors = {
    red: { bg: '#ffcccc', border: '#ef4444', text: '#991b1b' },
    green: { bg: '#ccdd99', border: '#22c55e', text: '#15803d' },
    blue: { bg: '#cceeff', border: '#3b82f6', text: '#1e40af' }
  };

  const frequencies = { red: 3, green: 2, blue: 1 };
  
  const signHash = useMemo(() => new SignHash(numRounds, 4, 42), [numRounds]);

  useEffect(() => {
    const generatedRounds = [];
    for (let r = 0; r < numRounds; r++) {
      const roundData = { red: [], green: [], blue: [], sketch: 0 };
      
      let sketch = 0;
      Object.keys(frequencies).forEach(person => {
        const uniqueId = person.charCodeAt(0);
        const hash = signHash.hash(uniqueId, r);
        
        for (let i = 0; i < frequencies[person]; i++) {
          roundData[person].push(hash);
          sketch += hash;
        }
      });
      roundData.sketch = sketch;
      generatedRounds.push(roundData);
    }
    setRounds(generatedRounds);
  }, [signHash, numRounds]);

  useEffect(() => {
    if (isPlaying && currentRound < numRounds) {
      if (animationPhase === 'stack') {
        const timer = setTimeout(() => {
          setAnimationPhase('position');
        }, speed * 200);
        return () => clearTimeout(timer);
      } else if (animationPhase === 'position') {
        const timer = setTimeout(() => {
          if (currentRound < numRounds - 1) {
            setCurrentRound(prev => prev + 1);
            setAnimationPhase('stack');
          } else {
            setIsPlaying(false);
          }
        }, speed * 800);
        return () => clearTimeout(timer);
      }
    }
  }, [isPlaying, currentRound, animationPhase, speed, numRounds]);

  const reset = () => {
    setCurrentRound(0);
    setIsPlaying(false);
    setAnimationPhase('stack');
  };

  const handleNumRoundsChange = (newNumRounds) => {
    setNumRounds(newNumRounds);
    setCurrentRound(0);
    setIsPlaying(false);
    setAnimationPhase('stack');
  };

  const calculateEstimates = () => {
    const estimates = { red: [], green: [], blue: [] };
    rounds.slice(0, currentRound + 1).forEach((round, idx) => {
      Object.keys(frequencies).forEach(person => {
        const personHash = round[person][0];
        const estimate = round.sketch * personHash;
        estimates[person].push({ 
          roundNum: idx + 1,
          sketch: round.sketch, 
          hash: personHash, 
          result: estimate 
        });
      });
    });
    return estimates;
  };

  const estimates = currentRound >= 0 && rounds.length > 0 ? calculateEstimates() : null;
  const currentRoundData = rounds[currentRound];

  const allCircles = currentRoundData ? [
    ...Object.keys(frequencies).flatMap(person => 
      Array(frequencies[person]).fill(null).map((_, i) => ({
        color: person,
        value: currentRoundData[person][0],
        id: `${person}-${i}`
      }))
    )
  ] : [];

  return (
    <div className="w-full bg-white p-4">
      <div className="max-w-6xl mx-auto">
        {/* Compact header */}
        <div className="mb-3 text-center">
          <h3 className="text-2xl font-bold text-gray-800">Tug-of-War Sketch</h3>
          <p className="text-sm text-gray-600">Round {currentRound + 1} of {numRounds}</p>
        </div>

        {/* Compact controls */}
        <div className="flex gap-2 justify-center mb-4 items-center flex-wrap text-sm">
          <div className="flex items-center gap-1 bg-gray-50 px-3 py-2 rounded shadow-sm">
            <label className="font-semibold text-gray-700">Rounds:</label>
            <input
              type="number"
              min="3"
              max="500"
              value={numRounds}
              onChange={(e) => handleNumRoundsChange(parseInt(e.target.value) || 100)}
              className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
            />
          </div>
          
          <div className="flex items-center gap-1 bg-gray-50 px-3 py-2 rounded shadow-sm">
            <label className="font-semibold text-gray-700">Speed:</label>
            <select
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="px-2 py-1 border border-gray-300 rounded text-sm"
            >
              <option value={1.0}>Slow</option>
              <option value={0.3}>Normal</option>
              <option value={0.1}>Fast</option>
            </select>
          </div>
          
          <button
            onClick={() => {
              setIsPlaying(!isPlaying);
              if (!isPlaying && animationPhase === 'position') {
                setAnimationPhase('stack');
                setCurrentRound(prev => prev + 1);
              }
            }}
            disabled={currentRound >= numRounds - 1 && !isPlaying}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white px-4 py-2 rounded flex items-center gap-1 font-semibold transition-colors text-sm"
          >
            {isPlaying ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Play</>}
          </button>
          <button
            onClick={() => {
              if (currentRound < numRounds - 1) {
                setCurrentRound(prev => prev + 1);
                setAnimationPhase('stack');
                setTimeout(() => setAnimationPhase('position'), 100);
              }
            }}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded flex items-center gap-1 font-semibold transition-colors text-sm"
          >
            <SkipForward size={16} /> Next
          </button>
          <button
            onClick={reset}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded flex items-center gap-1 font-semibold transition-colors text-sm"
          >
            <RotateCcw size={16} /> Reset
          </button>
        </div>

        {/* Compact visualization */}
        <div className="bg-gray-50 rounded-lg shadow p-6 mb-4 relative" style={{ height: '200px' }}>
          <div className="flex items-center justify-center h-full relative">
            <div className="absolute" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
              <SketchBox value={currentRoundData?.sketch || 0} />
            </div>

            {allCircles.map((circle, idx) => {
              let position = {};
              
              if (animationPhase === 'stack') {
                position = {
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, 70px)',
                  zIndex: idx
                };
              } else {
                const leftCircles = allCircles.filter(c => c.value === -1);
                const rightCircles = allCircles.filter(c => c.value === 1);
                
                if (circle.value === -1) {
                  const leftIndex = leftCircles.findIndex(c => c.id === circle.id);
                  const spacing = 60;
                  const totalWidth = (leftCircles.length - 1) * spacing;
                  const startOffset = -150 - totalWidth / 2;
                  const offset = startOffset + leftIndex * spacing;
                  
                  position = {
                    left: '50%',
                    top: '50%',
                    transform: `translate(calc(-50% + ${offset}px), -50%)`,
                    zIndex: 10
                  };
                } else {
                  const rightIndex = rightCircles.findIndex(c => c.id === circle.id);
                  const spacing = 60;
                  const totalWidth = (rightCircles.length - 1) * spacing;
                  const startOffset = 150 - totalWidth / 2;
                  const offset = startOffset + rightIndex * spacing;
                  
                  position = {
                    left: '50%',
                    top: '50%',
                    transform: `translate(calc(-50% + ${offset}px), -50%)`,
                    zIndex: 10
                  };
                }
              }

              return (
                <div
                  key={circle.id}
                  className="absolute transition-all duration-300 ease-out"
                  style={position}
                >
                  <Circle color={circle.color} value={circle.value} colors={colors} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Compact estimates */}
        {estimates && currentRound >= 0 && (
          <div className="bg-gray-50 rounded-lg shadow p-4">
            <h4 className="text-lg font-bold mb-3 text-gray-700 text-center">Estimates</h4>
            
            <div className="grid grid-cols-3 gap-4">
              {Object.keys(frequencies).map(person => {
                const personEstimates = estimates[person];
                const totalEstimates = personEstimates.length;
                const showEllipsis = totalEstimates > 3;
                const visibleEstimates = showEllipsis 
                  ? personEstimates.slice(-3) 
                  : personEstimates;
                
                const runningAvg = personEstimates.reduce((sum, e) => sum + e.result, 0) / totalEstimates;
                
                return (
                  <div key={person} className="flex flex-col">
                    <div 
                      className="rounded p-3 border-2"
                      style={{ 
                        backgroundColor: colors[person].bg,
                        borderColor: colors[person].border
                      }}
                    >
                      <div className="space-y-1 font-mono text-xs">
                        {showEllipsis && (
                          <div className="text-center text-gray-500 text-lg">⋮</div>
                        )}
                        {visibleEstimates.map((est, idx) => (
                          <div key={idx} className="flex items-center justify-between gap-1">
                            <span className="text-xs text-gray-500">R{est.roundNum}:</span>
                            <span>{est.sketch}×{est.hash > 0 ? '+' : ''}{est.hash}={est.result}</span>
                          </div>
                        ))}
                        <div className="border-t-2 pt-1 mt-1 font-bold text-sm" style={{ borderColor: colors[person].border }}>
                          Avg: {runningAvg.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="text-center mt-1 text-xs text-gray-600">
                      True: {frequencies[person]}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Circle = ({ color, value, colors }) => (
  <div 
    className="w-12 h-12 rounded-full border-3 flex items-center justify-center font-bold text-sm shadow-md"
    style={{ 
      backgroundColor: colors[color].bg,
      borderColor: colors[color].border,
      borderWidth: '3px',
      color: colors[color].text
    }}
  >
    {value > 0 ? '+1' : '−1'}
  </div>
);

const SketchBox = ({ value }) => (
  <div className="w-20 h-20 border-3 border-gray-800 bg-white flex items-center justify-center font-bold text-2xl shadow-lg">
    {value > 0 ? '+' : ''}{value}
  </div>
);

export default TugOfWarVisualization;