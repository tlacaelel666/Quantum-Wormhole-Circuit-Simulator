import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Cpu, Zap, Network, Save, Upload, Download, Sparkles, Eraser } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, ReferenceLine } from 'recharts';
import { GoogleGenAI } from "@google/genai";
import { createWormholeFragmentationSystem, reconstructWithWormholeGeometry } from '../services/wormhole';
import type { Circuit as CircuitType, Qubit as QubitType, ReconstructionResult } from '../types';

const SimpleMarkdown: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(\*\*.*?\*\*)/g).filter(part => part);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="text-purple-300">{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
};

const AiAnalysisDisplay: React.FC<{ content: string }> = ({ content }) => {
    const lines = content.split('\n').filter(line => line.trim() !== '');
    return (
        <div className="text-sm text-gray-300 space-y-2 font-mono">
            {lines.map((line, index) => {
                if (line.startsWith('# ')) {
                    return <h4 key={index} className="text-md font-semibold text-purple-300 mt-3 mb-1">{line.substring(2)}</h4>;
                }
                 if (line.startsWith('* ')) {
                    return <div key={index} className="flex items-start"><span className="mr-2">•</span><p className="flex-1"><SimpleMarkdown text={line.substring(2)}/></p></div>;
                }
                return <p key={index}><SimpleMarkdown text={line}/></p>;
            })}
        </div>
    );
};


const QuantumWormholeSimulator = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const circuitCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  
  // Fixed parameters
  const GRID_SIZE = 32;
  const NUM_LAYERS = 5;
  const VISCOSITY = 0.5;
  const ACTIVE_LAYER = 4;
  
  const [framework, setFramework] = useState<QuantumLaminarFlow | null>(null);
  const [quantumCircuitA, setQuantumCircuitA] = useState<QuantumCircuit | null>(null);
  const [quantumCircuitB, setQuantumCircuitB] = useState<QuantumCircuit | null>(null);
  const [qubitStatesA, setQubitStatesA] = useState<any[]>([]);
  const [qubitStatesB, setQubitStatesB] = useState<any[]>([]);
  const [measurementResultsA, setMeasurementResultsA] = useState<number[]>([]);
  const [measurementResultsB, setMeasurementResultsB] = useState<number[]>([]);
  const [interCircuitEntanglement, setInterCircuitEntanglement] = useState<number[][]>([]);
  const [metricsHistory, setMetricsHistory] = useState<{ time: number; streamlineCoherence: number; }[]>([]);
  const [phaseVector, setPhaseVector] = useState({ x: 0, y: 0 });
  const [reconstructionData, setReconstructionData] = useState<ReconstructionResult | null>(null);

  // AI Analysis State
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Seed and Export states
  const [seedInput, setSeedInput] = useState('');
  const [generatedSeed, setGeneratedSeed] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportData, setExportData] = useState('');
  
  // Tooltip state for interactive canvas
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);


  // Gate selection states
  const initialGates = {
    hadamard: [false, false, false, false, false],
    pauliX: [false, false, false, false, false],
    pauliY: [false, false, false, false, false],
    pauliZ: [false, false, false, false, false],
    rotationX: [false, false, false, false, false],
    rotationY: [false, false, false, false, false],
    rotationZ: [false, false, false, false, false],
    tGate: [false, false, false, false, false],
    swap: [false, false, false, false], // For swapping 0-1, 1-2, 2-3, 3-4
    ccnot: [false, false, false], // For CCNOT(0,1,2), (1,2,3), (2,3,4)
  };

  const [selectedGatesA, setSelectedGatesA] = useState({
    ...initialGates,
    hadamard: [true, true, true, true, true],
    rotationZ: [true, false, true, false, true],
  });
  
  const [selectedGatesB, setSelectedGatesB] = useState({
    ...initialGates,
    hadamard: [true, true, true, true, true],
    rotationZ: [false, true, false, true, false],
  });
  
  const [circuitBEnabled, setCircuitBEnabled] = useState(false);
  const [interCircuitEntanglementEnabled, setInterCircuitEntanglementEnabled] = useState(false);
  
  const animationRef = useRef<number | null>(null);

  // Available quantum gates
  const GATE_TYPES: { [key: string]: string } = {
    hadamard: 'H',
    pauliX: 'X',
    pauliY: 'Y', 
    pauliZ: 'Z',
    rotationX: 'Rx',
    rotationY: 'Ry',
    rotationZ: 'Rz',
    tGate: 'T'
  };

  // Enhanced Qubit class with more gates
  class Qubit {
    id: string;
    state: number[];
    phase: number;
    entangled: boolean;
    entangledWith: (string | number)[];
    appliedGates: string[];

    constructor(id: string, initialState = [1, 0]) {
      this.id = id;
      this.state = [...initialState];
      this.phase = 0;
      this.entangled = false;
      this.entangledWith = [];
      this.appliedGates = [];
    }

    hadamard() {
      const [a, b] = this.state;
      const sqrt2 = Math.sqrt(2);
      this.state = [(a + b) / sqrt2, (a - b) / sqrt2];
      this.appliedGates.push('H');
      return this;
    }

    pauliX() {
      this.state = [this.state[1], this.state[0]];
      this.appliedGates.push('X');
      return this;
    }

    pauliY() {
      const [a, b] = this.state;
      this.state = [-b, a];
      this.appliedGates.push('Y');
      return this;
    }

    pauliZ() {
      this.state = [this.state[0], -this.state[1]];
      this.appliedGates.push('Z');
      return this;
    }

    rotationX(theta = Math.PI/4) {
      const [a, b] = this.state;
      const cosHalf = Math.cos(theta/2);
      const sinHalf = Math.sin(theta/2);
      this.state = [a * cosHalf - b * sinHalf, a * sinHalf + b * cosHalf];
      this.appliedGates.push('Rx');
      return this;
    }

    rotationY(theta = Math.PI/4) {
      const [a, b] = this.state;
      const cosHalf = Math.cos(theta/2);
      const sinHalf = Math.sin(theta/2);
      this.state = [a * cosHalf - b * sinHalf, a * sinHalf + b * cosHalf];
      this.appliedGates.push('Ry');
      return this;
    }

    rotationZ(theta = Math.PI/4) {
      const [a, b] = this.state;
      const cosHalf = Math.cos(theta/2);
      const sinHalf = Math.sin(theta/2);
      this.state = [a * cosHalf, b * cosHalf + b * sinHalf * Math.sin(Math.PI/2)];
      this.phase += theta;
      this.appliedGates.push('Rz');
      return this;
    }

    tGate() {
      const phase = Math.PI/4;
      this.state = [this.state[0], this.state[1] * Math.cos(phase) + this.state[1] * Math.sin(phase)];
      this.phase += phase;
      this.appliedGates.push('T');
      return this;
    }

    measure() {
      const prob0 = Math.abs(this.state[0]) ** 2;
      const prob1 = Math.abs(this.state[1]) ** 2;
      
      const random = Math.random();
      if (random < prob0) {
        this.state = [1, 0];
        return 0;
      } else {
        this.state = [0, 1];
        return 1;
      }
    }

    getProbability1() {
      return Math.abs(this.state[1]) ** 2;
    }

    getProbability0() {
      return Math.abs(this.state[0]) ** 2;
    }

    reset() {
      this.state = [1, 0];
      this.phase = 0;
      this.entangled = false;
      this.entangledWith = [];
      this.appliedGates = [];
    }
  }

  type SelectedGates = typeof selectedGatesA;

  class QuantumCircuit {
    numQubits: number;
    circuitId: string;
    qubits: Qubit[];
    gates: any[];
    measurementHistory: { timestamp: number; results: number[]; probabilities: number[]; }[];
    selectedGates: SelectedGates | null;
    interCircuitConnections: number[][];

    constructor(numQubits = 5, circuitId = 'A', selectedGates: SelectedGates | null = null) {
      this.numQubits = numQubits;
      this.circuitId = circuitId;
      this.qubits = [];
      this.gates = [];
      this.measurementHistory = [];
      this.selectedGates = selectedGates;
      this.interCircuitConnections = [];
      
      for (let i = 0; i < numQubits; i++) {
        this.qubits.push(new Qubit(`${circuitId}${i}`));
      }
      
      this.setupCircuit();
    }

    setupCircuit() {
      if (!this.selectedGates) return;
      
      this.qubits.forEach((qubit, i) => {
        if (this.selectedGates!.hadamard[i]) qubit.hadamard();
        if (this.selectedGates!.pauliX[i]) qubit.pauliX();
        if (this.selectedGates!.pauliY[i]) qubit.pauliY();
        if (this.selectedGates!.pauliZ[i]) qubit.pauliZ();
        if (this.selectedGates!.rotationX[i]) qubit.rotationX();
        if (this.selectedGates!.rotationY[i]) qubit.rotationY();
        if (this.selectedGates!.rotationZ[i]) qubit.rotationZ();
        if (this.selectedGates!.tGate[i]) qubit.tGate();
      });

      this.createIntraCircuitEntanglement();
      
      if (this.selectedGates.swap) {
          this.selectedGates.swap.forEach((isSwap, i) => {
              if (isSwap) {
                  this.swap(i, i + 1);
              }
          });
      }

      if (this.selectedGates.ccnot) {
          this.selectedGates.ccnot.forEach((isCCNOT, i) => {
              if (isCCNOT) {
                  // combinations: 0,1->2; 1,2->3; 2,3->4
                  this.ccnot(i, i + 1, i + 2);
              }
          });
      }
    }

    ccnot(c1: number, c2: number, t: number) {
      if (c1 < this.numQubits && c2 < this.numQubits && t < this.numQubits) {
        // Entangle all three qubits to represent the multi-qubit gate connection
        this.entangleQubits(c1, t);
        this.entangleQubits(c2, t);
        this.entangleQubits(c1, c2);

        // Simplified one-time conditional flip based on the state of the controls
        // at the moment the circuit is defined.
        if (this.qubits[c1].getProbability1() > 0.5 && this.qubits[c2].getProbability1() > 0.5) {
            this.qubits[t].pauliX();
        }
      }
    }

    swap(i: number, j: number) {
        if (i < this.numQubits && j < this.numQubits) {
            const tempState = this.qubits[i].state;
            this.qubits[i].state = this.qubits[j].state;
            this.qubits[j].state = tempState;

            const tempPhase = this.qubits[i].phase;
            this.qubits[i].phase = this.qubits[j].phase;
            this.qubits[j].phase = tempPhase;
        }
    }

    createIntraCircuitEntanglement() {
      const entanglementPairs = [[0, 1], [2, 3], [1, 4]];
      entanglementPairs.forEach(([i, j]) => {
        if (i < this.numQubits && j < this.numQubits) this.entangleQubits(i, j);
      });
    }

    entangleQubits(i: number, j: number) {
      if (i < this.numQubits && j < this.numQubits) {
        this.qubits[i].entangled = true;
        this.qubits[j].entangled = true;
        this.qubits[i].entangledWith.push(j);
        this.qubits[j].entangledWith.push(i);
      }
    }

    createInterCircuitEntanglement(otherCircuit: QuantumCircuit, connections: number[][]) {
      this.interCircuitConnections = connections;
      connections.forEach(([thisQubit, otherQubit]) => {
        if (thisQubit < this.numQubits && otherQubit < otherCircuit.numQubits) {
          const thisState = this.qubits[thisQubit].state;
          const otherState = otherCircuit.qubits[otherQubit].state;
          const avgState = [(thisState[0] + otherState[0]) / Math.sqrt(2), (thisState[1] + otherState[1]) / Math.sqrt(2)];
          this.qubits[thisQubit].state = avgState;
          otherCircuit.qubits[otherQubit].state = avgState;
          this.qubits[thisQubit].entangled = true;
          otherCircuit.qubits[otherQubit].entangled = true;
          this.qubits[thisQubit].entangledWith.push(`${otherCircuit.circuitId}${otherQubit}`);
          otherCircuit.qubits[otherQubit].entangledWith.push(`${this.circuitId}${thisQubit}`);
        }
      });
    }

    evolve(dt: number) {
      this.qubits.forEach((qubit, i) => {
        const omega = 0.1 + i * 0.03;
        qubit.phase += omega * dt;
        const angle = 0.008 * Math.sin(qubit.phase);
        qubit.rotationZ(angle);
      });
    }

    measureAll() {
      const results = this.qubits.map(qubit => qubit.measure());
      this.measurementHistory.push({ timestamp: Date.now(), results: [...results], probabilities: this.qubits.map(q => q.getProbability1()) });
      if (this.measurementHistory.length > 100) this.measurementHistory.shift();
      return results;
    }

    getCurrentProbabilities() {
      return this.qubits.map((qubit, idx) => ({
        prob0: qubit.getProbability0(),
        prob1: qubit.getProbability1(),
        phase: qubit.phase,
        entangled: qubit.entangled,
        entangledWith: qubit.entangledWith,
        appliedGates: qubit.appliedGates,
        id: `${this.circuitId}${idx}`
      }));
    }

    getSystemProbability() {
      return this.qubits.reduce((prob, qubit) => prob * qubit.getProbability1(), 1);
    }

    resetCircuit() {
      this.qubits.forEach(qubit => qubit.reset());
      this.measurementHistory = [];
      this.interCircuitConnections = [];
      this.setupCircuit();
    }
  }

  class QuantumLaminarFlow {
    gridSize: [number, number];
    domainSize: [number, number];
    nx: number;
    ny: number;
    Lx: number;
    Ly: number;
    numLayers: number;
    viscosityParam: number;
    quantumCircuitA: QuantumCircuit;
    quantumCircuitB: QuantumCircuit | null;
    dualCircuitMode: boolean;
    x: number[];
    y: number[];
    hbar: number;
    time: number;
    masaInformativaLayers: MasaInformativaLayer[];
    streamlines: QuantumStreamline[];
    informationalReynolds: number;

    constructor(gridSize: number, domainSize: [number, number], quantumCircuitA: QuantumCircuit, quantumCircuitB: QuantumCircuit | null = null) {
      this.gridSize = [gridSize, gridSize];
      this.domainSize = domainSize;
      this.nx = gridSize;
      this.ny = gridSize;
      this.Lx = domainSize[0];
      this.Ly = domainSize[1];
      this.numLayers = NUM_LAYERS;
      this.viscosityParam = VISCOSITY;
      this.quantumCircuitA = quantumCircuitA;
      this.quantumCircuitB = quantumCircuitB;
      this.dualCircuitMode = quantumCircuitB !== null;
      this.x = Array.from({length: this.nx}, (_, i) => i * this.Lx / (this.nx - 1));
      this.y = Array.from({length: this.ny}, (_, i) => i * this.Ly / (this.ny - 1));
      this.hbar = 1.055e-34;
      this.time = 0;
      this.masaInformativaLayers = this.initializeInfoLayersWithQuantum();
      this.streamlines = this.defineQuantumStreamlines();
      this.informationalReynolds = this.computeInformationalReynolds();
    }

    initializeInfoLayersWithQuantum() {
      const layers = [];
      for (let layerIdx = 0; layerIdx < this.numLayers; layerIdx++) {
        const depth = layerIdx * 2.0;
        const masaInformativa: number[][] = [];
        const velocityField: [number, number][][] = [];
        for (let i = 0; i < this.ny; i++) {
          masaInformativa[i] = [];
          velocityField[i] = [];
          for (let j = 0; j < this.nx; j++) {
            const x = this.x[j];
            const y = this.y[i];
            let masa = 0;
            if (this.quantumCircuitA) {
              const probsA = this.quantumCircuitA.getCurrentProbabilities();
              for (let qubitIdx = 0; qubitIdx < 5; qubitIdx++) {
                const centerX = this.Lx * (0.15 + 0.12 * qubitIdx);
                const centerY = this.dualCircuitMode ? this.Ly * 0.25 : this.Ly * 0.5;
                const sigma = 0.8 + layerIdx * 0.2;
                const qubitProb = probsA[qubitIdx] ? probsA[qubitIdx].prob1 : 0.5;
                const gaussian = Math.exp(-((x - centerX)**2 + (y - centerY)**2) / (2 * sigma**2));
                masa += gaussian * qubitProb * (1 + 0.3 * Math.sin(probsA[qubitIdx]?.phase || 0));
              }
            }
            if (this.quantumCircuitB && this.dualCircuitMode) {
              const probsB = this.quantumCircuitB.getCurrentProbabilities();
              for (let qubitIdx = 0; qubitIdx < 5; qubitIdx++) {
                const centerX = this.Lx * (0.15 + 0.12 * qubitIdx);
                const centerY = this.Ly * 0.75;
                const sigma = 0.8 + layerIdx * 0.2;
                const qubitProb = probsB[qubitIdx] ? probsB[qubitIdx].prob1 : 0.5;
                const gaussian = Math.exp(-((x - centerX)**2 + (y - centerY)**2) / (2 * sigma**2));
                masa += gaussian * qubitProb * (1 + 0.3 * Math.sin(probsB[qubitIdx]?.phase || 0)) * 0.8;
              }
            }
            masa += 0.03 * (Math.random() - 0.5);
            masaInformativa[i][j] = Math.max(0.01, masa);
            let vx = 0, vy = 0;
            if (this.quantumCircuitA) {
              const probsA = this.quantumCircuitA.getCurrentProbabilities();
              probsA.forEach((probData) => {
                if (probData.entangled) {
                  const entanglementStrength = probData.entangledWith.length;
                  const phase = probData.phase;
                  vx += entanglementStrength * Math.sin(phase + x * 0.3) * probData.prob1;
                  vy += entanglementStrength * Math.cos(phase + y * 0.3) * probData.prob0;
                }
              });
            }
            if (this.quantumCircuitB && this.dualCircuitMode) {
              const probsB = this.quantumCircuitB.getCurrentProbabilities();
              probsB.forEach((probData) => {
                if (probData.entangled) {
                  const entanglementStrength = probData.entangledWith.length;
                  const phase = probData.phase;
                  vx += entanglementStrength * Math.cos(phase + x * 0.4) * probData.prob1 * 0.7;
                  vy += entanglementStrength * Math.sin(phase + y * 0.4) * probData.prob0 * -0.7;
                }
              });
            }
            const dx = x - this.Lx/2;
            const dy = y - this.Ly/2;
            const r = Math.sqrt(dx*dx + dy*dy) + 0.1;
            vx += -dy / r * Math.exp(-r / 4) * 0.4;
            vy += dx / r * Math.exp(-r / 4) * 0.4;
            velocityField[i][j] = [vx, vy];
          }
        }
        const entanglementMatrix = this.generateQuantumEntanglementMatrix(depth);
        layers.push(new MasaInformativaLayer(depth, masaInformativa, velocityField, entanglementMatrix));
      }
      return layers;
    }

    generateQuantumEntanglementMatrix(depth: number) {
      const size = this.dualCircuitMode ? 10 : 5;
      const matrix: number[][] = [];
      for (let i = 0; i < size; i++) {
        matrix[i] = [];
        for (let j = 0; j < size; j++) {
          let entanglement = 0;
          if (i < 5 && j < 5 && this.quantumCircuitA) {
            const probsA = this.quantumCircuitA.getCurrentProbabilities();
            if (probsA[i] && probsA[j] && probsA[i].entangledWith.includes(j)) {
              entanglement = Math.sqrt(probsA[i].prob1 * probsA[j].prob1) * 2;
            }
          }
          if (i >= 5 && j >= 5 && this.quantumCircuitB && this.dualCircuitMode) {
            const probsB = this.quantumCircuitB.getCurrentProbabilities();
            const idxI = i - 5, idxJ = j - 5;
            if (probsB[idxI] && probsB[idxJ] && probsB[idxI].entangledWith.includes(idxJ)) {
              entanglement = Math.sqrt(probsB[idxI].prob1 * probsB[idxJ].prob1) * 2;
            }
          }
          if (((i < 5 && j >= 5) || (i >= 5 && j < 5)) && this.quantumCircuitA && this.quantumCircuitB) {
            const connections = this.quantumCircuitA.interCircuitConnections;
            if (connections.some(([a, b]) => (i === a && j - 5 === b) || (i - 5 === b && j === a))) {
              entanglement = 1.5;
            }
          }
          matrix[i][j] = entanglement * Math.exp(-depth / 12.0);
        }
      }
      return matrix;
    }

    defineQuantumStreamlines() {
      const streamlines: QuantumStreamline[] = [];
      const numStreamlines = this.dualCircuitMode ? 20 : 15;
      for (let i = 0; i < numStreamlines; i++) {
        let startX, startY;
        if (this.dualCircuitMode) {
          if (i < numStreamlines / 2) {
            const qubitIdx = i % 5;
            startX = this.Lx * (0.15 + 0.12 * qubitIdx) + (Math.random() - 0.5) * 1.5;
            startY = this.Ly * 0.25 + (Math.random() - 0.5) * 2;
          } else {
            const qubitIdx = (i - numStreamlines / 2) % 5;
            startX = this.Lx * (0.15 + 0.12 * qubitIdx) + (Math.random() - 0.5) * 1.5;
            startY = this.Ly * 0.75 + (Math.random() - 0.5) * 2;
          }
        } else {
          const qubitIdx = i % 5;
          startX = this.Lx * (0.15 + 0.12 * qubitIdx) + (Math.random() - 0.5) * 1.5;
          startY = this.Ly * 0.5 + (Math.random() - 0.5) * 3;
        }
        const coords = this.integrateStreamline([startX, startY]);
        if (coords.length > 1) {
          const probDensity = this.computeQuantumProbabilityDensity(coords, i);
          const phase = this.computeQuantumPhase(coords, i);
          const coherenceLength = this.computeCoherenceLength(coords);
          streamlines.push(new QuantumStreamline(coords, probDensity, phase, coherenceLength));
        }
      }
      return streamlines;
    }

    computeQuantumProbabilityDensity(coords: [number, number][], streamlineId: number) {
      if (coords.length === 0) return [];
      const probDensity = coords.map((coord, idx) => {
        let quantumProb = 0.5;
        const isCircuitB = this.dualCircuitMode && streamlineId >= (this.dualCircuitMode ? 10 : 15);
        const circuit = isCircuitB ? this.quantumCircuitB : this.quantumCircuitA;
        if (circuit) {
          const probs = circuit.getCurrentProbabilities();
          const qubitIdx = streamlineId % 5;
          if (probs[qubitIdx]) {
            quantumProb = probs[qubitIdx].prob1;
            const t = idx / coords.length;
            quantumProb *= (1 + 0.4 * Math.sin(4 * Math.PI * t + probs[qubitIdx].phase));
          }
        }
        return Math.max(0.1, quantumProb);
      });
      const sum = probDensity.reduce((a, b) => a + b, 0);
      return sum > 0 ? probDensity.map(p => p / sum) : probDensity;
    }

    computeQuantumPhase(coords: [number, number][], streamlineId: number) {
      if (coords.length < 2) return Array(coords.length).fill(0);
      const distances = [0];
      for (let i = 1; i < coords.length; i++) {
        const dx = coords[i][0] - coords[i-1][0];
        const dy = coords[i][1] - coords[i-1][1];
        distances.push(distances[distances.length - 1] + Math.sqrt(dx*dx + dy*dy));
      }
      let quantumPhase = 2 * Math.PI * streamlineId / (this.dualCircuitMode ? 20 : 15);
      const isCircuitB = this.dualCircuitMode && streamlineId >= 10;
      const circuit = isCircuitB ? this.quantumCircuitB : this.quantumCircuitA;
      if (circuit) {
        const probs = circuit.getCurrentProbabilities();
        const qubitIdx = streamlineId % 5;
        if (probs[qubitIdx]) quantumPhase += probs[qubitIdx].phase;
      }
      return distances.map(d => d * 2.5 + quantumPhase);
    }

    computeCoherenceLength(coords: [number, number][]) {
      if (coords.length < 2) return 1.0;
      let totalLength = 0;
      for (let i = 1; i < coords.length; i++) {
        totalLength += Math.sqrt((coords[i][0] - coords[i-1][0])**2 + (coords[i][1] - coords[i-1][1])**2);
      }
      let quantumCoherence = 1.0;
      if (this.quantumCircuitA) quantumCoherence += this.quantumCircuitA.getSystemProbability() * 1.5;
      if (this.quantumCircuitB && this.dualCircuitMode) quantumCoherence += this.quantumCircuitB.getSystemProbability() * 1.2;
      return totalLength * Math.exp(-totalLength / 9.0) * quantumCoherence + 0.5;
    }

    computeInformationalReynolds() {
      const characteristicVelocity = 1.0;
      const characteristicLength = Math.min(this.Lx, this.Ly);
      let quantumFactor = 1.0;
      if (this.quantumCircuitA) {
        const avgProbA = this.quantumCircuitA.getCurrentProbabilities().reduce((sum, p) => sum + p.prob1, 0) / 5;
        quantumFactor += avgProbA;
      }
      if (this.quantumCircuitB && this.dualCircuitMode) {
        const avgProbB = this.quantumCircuitB.getCurrentProbabilities().reduce((sum, p) => sum + p.prob1, 0) / 5;
        quantumFactor += avgProbB * 0.8;
      }
      return (characteristicVelocity * characteristicLength * quantumFactor) / this.viscosityParam;
    }

    integrateStreamline(startPoint: [number, number]) {
      const dt = 0.025;
      const maxSteps = 500;
      const coords: [number, number][] = [startPoint.slice() as [number, number]];
      let currentPoint = startPoint.slice();
      for (let step = 0; step < maxSteps; step++) {
        const velocity = this.interpolateVelocity(currentPoint);
        currentPoint[0] += velocity[0] * dt;
        currentPoint[1] += velocity[1] * dt;
        if (currentPoint[0] < 0.1 || currentPoint[0] > this.Lx - 0.1 || currentPoint[1] < 0.1 || currentPoint[1] > this.Ly - 0.1) break;
        if (Math.sqrt(velocity[0]**2 + velocity[1]**2) < 0.001) break;
        coords.push(currentPoint.slice() as [number, number]);
      }
      return coords;
    }

    interpolateVelocity(point: number[]) {
      if (this.masaInformativaLayers.length === 0) return [0, 0];
      const layer = this.masaInformativaLayers[ACTIVE_LAYER];
      const xi = point[0] * (this.nx - 1) / this.Lx;
      const yi = point[1] * (this.ny - 1) / this.Ly;
      const xIdx = Math.max(0, Math.min(Math.floor(xi), this.nx - 2));
      const yIdx = Math.max(0, Math.min(Math.floor(yi), this.ny - 2));
      if (layer.velocityField[yIdx] && layer.velocityField[yIdx][xIdx]) return layer.velocityField[yIdx][xIdx];
      return [0, 0];
    }

    evolve(dt: number) {
      this.time += dt;
      if (this.quantumCircuitA) {
        this.quantumCircuitA.evolve(dt);
        this.updateMasaInformativaFromQuantum();
      }
      if (this.quantumCircuitB && this.dualCircuitMode) this.quantumCircuitB.evolve(dt);
      this.streamlines.forEach((streamline) => {
        const oscillation = 1 + 0.1 * Math.sin(this.time * 0.25);
        streamline.coherenceLength *= 0.9998 * oscillation;
        streamline.coordinates.forEach((coord, idx) => {
          if (idx > 0 && idx < streamline.coordinates.length - 1) {
            const phaseEvolution = streamline.phase[idx] || 0;
            const perturbation = 0.002 * Math.sin(phaseEvolution + this.time);
            coord[0] += perturbation * (Math.random() - 0.5);
            coord[1] += perturbation * (Math.random() - 0.5);
            coord[0] = Math.max(0.1, Math.min(this.Lx - 0.1, coord[0]));
            coord[1] = Math.max(0.1, Math.min(this.Ly - 0.1, coord[1]));
          }
        });
      });
    }

    updateMasaInformativaFromQuantum() {
      const layer = this.masaInformativaLayers[ACTIVE_LAYER];
      for (let i = 0; i < this.ny; i++) {
        for (let j = 0; j < this.nx; j++) {
          const x = this.x[j];
          const y = this.y[i];
          let newMasa = 0;
          if (this.quantumCircuitA) {
            const probsA = this.quantumCircuitA.getCurrentProbabilities();
            for (let qubitIdx = 0; qubitIdx < 5; qubitIdx++) {
              const centerX = this.Lx * (0.15 + 0.12 * qubitIdx);
              const centerY = this.dualCircuitMode ? this.Ly * 0.25 : this.Ly * 0.5;
              const sigma = 0.8 + ACTIVE_LAYER * 0.2;
              const qubitProb = probsA[qubitIdx] ? probsA[qubitIdx].prob1 : 0.5;
              const gaussian = Math.exp(-((x - centerX)**2 + (y - centerY)**2) / (2 * sigma**2));
              newMasa += gaussian * qubitProb * (1 + 0.3 * Math.sin(probsA[qubitIdx]?.phase || 0));
            }
          }
          if (this.quantumCircuitB && this.dualCircuitMode) {
            const probsB = this.quantumCircuitB.getCurrentProbabilities();
            for (let qubitIdx = 0; qubitIdx < 5; qubitIdx++) {
              const centerX = this.Lx * (0.15 + 0.12 * qubitIdx);
              const centerY = this.Ly * 0.75;
              const sigma = 0.8 + ACTIVE_LAYER * 0.2;
              const qubitProb = probsB[qubitIdx] ? probsB[qubitIdx].prob1 : 0.5;
              const gaussian = Math.exp(-((x - centerX)**2 + (y - centerY)**2) / (2 * sigma**2));
              newMasa += gaussian * qubitProb * (1 + 0.3 * Math.sin(probsB[qubitIdx]?.phase || 0)) * 0.8;
            }
          }
          layer.density[i][j] = 0.92 * layer.density[i][j] + 0.08 * Math.max(0.01, newMasa);
        }
      }
    }
  }

  class MasaInformativaLayer {
    depth: number;
    density: number[][];
    velocityField: [number, number][][];
    entanglementMatrix: number[][];
    constructor(depth = 0, density: number[][] = [], velocityField: [number, number][][] = [], entanglementMatrix: number[][] = []) {
      this.depth = depth;
      this.density = density;
      this.velocityField = velocityField;
      this.entanglementMatrix = entanglementMatrix;
    }
  }

  class QuantumStreamline {
    coordinates: [number, number][];
    probabilityDensity: number[];
    phase: number[];
    coherenceLength: number;
    constructor(coordinates: [number, number][] = [], probabilityDensity: number[] = [], phase: number[] = [], coherenceLength = 1.0) {
      this.coordinates = coordinates;
      this.probabilityDensity = probabilityDensity;
      this.phase = phase;
      this.coherenceLength = coherenceLength;
    }
  }

  useEffect(() => {
    const circuitA = new QuantumCircuit(5, 'A', selectedGatesA);
    setQuantumCircuitA(circuitA);
    let circuitB = null;
    if (circuitBEnabled) {
      circuitB = new QuantumCircuit(5, 'B', selectedGatesB);
      setQuantumCircuitB(circuitB);
      if (interCircuitEntanglementEnabled) {
        const connections = [[2, 2]]; // Entangle Q2 of A with Q2 of B
        circuitA.createInterCircuitEntanglement(circuitB, connections);
        setInterCircuitEntanglement(connections);
      }
    } else {
        setInterCircuitEntanglement([]);
    }
    const newFramework = new QuantumLaminarFlow(GRID_SIZE, [10.0, 10.0], circuitA, circuitB);
    setFramework(newFramework);
    setQubitStatesA(circuitA.getCurrentProbabilities() as any);
    if (circuitB) setQubitStatesB(circuitB.getCurrentProbabilities() as any);
  }, [selectedGatesA, selectedGatesB, circuitBEnabled, interCircuitEntanglementEnabled]);

  useEffect(() => {
    if (isRunning && framework && quantumCircuitA) {
      const animate = () => {
        framework.evolve(0.1);
        setCurrentTime(framework.time);
        setQubitStatesA(quantumCircuitA.getCurrentProbabilities() as any);
        if (quantumCircuitB) setQubitStatesB(quantumCircuitB.getCurrentProbabilities() as any);
        
        // Update metrics for chart
        const allQubits = [...quantumCircuitA.qubits];
        if (quantumCircuitB && circuitBEnabled) {
            allQubits.push(...quantumCircuitB.qubits);
        }
        
        let sumX = 0, sumY = 0;
        allQubits.forEach(q => {
            sumX += Math.cos(q.phase);
            sumY += Math.sin(q.phase);
        });
        const avgX = sumX / allQubits.length;
        const avgY = sumY / allQubits.length;
        setPhaseVector({ x: avgX, y: avgY });

        const streamlineCoherence = framework.streamlines.reduce((sum, s) => sum + s.coherenceLength, 0) / framework.streamlines.length;
        
        const newMetric = {
            time: parseFloat(framework.time.toFixed(1)),
            streamlineCoherence
        };

        setMetricsHistory(prev => [...prev.slice(-100), newMetric]);


        if (framework.time % 3 < 0.1) {
          const resultsA = quantumCircuitA.measureAll();
          setMeasurementResultsA(resultsA);
          if (quantumCircuitB) {
            const resultsB = quantumCircuitB.measureAll();
            setMeasurementResultsB(resultsB);
          }
        }
        renderVisualization();
        renderQuantumCircuit();
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
    } else {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isRunning, framework, quantumCircuitA, quantumCircuitB]);

  const renderVisualization = () => {
    if (!framework || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const width = canvas.width;
    const height = canvas.height;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);
    const scaleX = width / framework.nx;
    const scaleY = height / framework.ny;

    if (framework.masaInformativaLayers[ACTIVE_LAYER]) {
      const layer = framework.masaInformativaLayers[ACTIVE_LAYER];
      for (let i = 0; i < framework.ny; i++) {
        for (let j = 0; j < framework.nx; j++) {
          if (layer.density[i] && layer.density[i][j] !== undefined) {
            const density = layer.density[i][j];
            const x = j * scaleX;
            const y = i * scaleY;
            const hue = 240 - density * 120;
            const alpha = Math.min(0.8, density * 2.5);
            ctx.fillStyle = `hsla(${hue}, 80%, 50%, ${alpha})`;
            ctx.fillRect(x, y, scaleX, scaleY);
          }
        }
      }
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.2)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= framework.ny; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * scaleY);
        ctx.lineTo(width, i * scaleY);
        ctx.stroke();
      }
      for (let j = 0; j <= framework.nx; j++) {
        ctx.beginPath();
        ctx.moveTo(j * scaleX, 0);
        ctx.lineTo(j * scaleX, height);
        ctx.stroke();
      }
    }

    if (framework.streamlines && framework.streamlines.length > 0) {
      framework.streamlines.forEach((streamline, idx) => {
        if (!streamline.coordinates || streamline.coordinates.length < 2) return;
        const coords = streamline.coordinates;
        ctx.beginPath();
        ctx.moveTo(coords[0][0] * (width / framework.Lx), coords[0][1] * (height / framework.Ly));
        for (let i = 1; i < coords.length; i++) {
          ctx.lineTo(coords[i][0] * (width / framework.Lx), coords[i][1] * (height / framework.Ly));
        }
        const coherence = streamline.coherenceLength || 1;
        const alpha = Math.min(0.9, coherence / 3);
        const hue = (idx * 72 + framework.time * 5) % 360;
        ctx.strokeStyle = `hsla(${hue}, 90%, 65%, ${alpha})`;
        ctx.lineWidth = 2 + coherence / 8;
        ctx.stroke();
      });
    }

    const drawQubit = (probData: any, qubitIdx: number, circuit: 'A' | 'B') => {
      const isB = circuit === 'B';
      const centerX = (0.15 + 0.12 * qubitIdx) * width;
      const centerY = (circuitBEnabled ? (isB ? 0.75 : 0.25) : 0.5) * height;
      const radius = 10 + probData.prob1 * 12;
      const baseHue = (qubitIdx + (isB ? 5 : 0)) * 72;

      ctx.save();
      ctx.shadowColor = `hsl(${baseHue}, 90%, 70%)`;
      ctx.shadowBlur = 15;
      ctx.fillStyle = `hsla(${baseHue}, 80%, 60%, 0.9)`;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.restore();

      // Draw phase indicator
      const phaseRadius = radius + 5;
      const phaseX = centerX + phaseRadius * Math.cos(probData.phase);
      const phaseY = centerY + phaseRadius * Math.sin(probData.phase);
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(phaseX, phaseY, 3, 0, 2 * Math.PI);
      ctx.fill();

      probData.entangledWith.forEach((otherQubit: string | number) => {
        if (typeof otherQubit === 'number' && otherQubit > qubitIdx) {
          const otherX = (0.15 + 0.12 * otherQubit) * width;
          const otherY = centerY;
          ctx.save();
          const laserHue = (qubitIdx + otherQubit + (isB ? 10 : 0)) * 36;
          ctx.shadowColor = `hsl(${laserHue}, 100%, 70%)`;
          ctx.shadowBlur = 10;
          
          ctx.strokeStyle = `hsla(${laserHue}, 90%, 70%, 0.4)`;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.lineTo(otherX, otherY);
          ctx.stroke();

          ctx.strokeStyle = `hsla(${laserHue}, 100%, 95%, 0.9)`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.lineTo(otherX, otherY);
          ctx.stroke();
          
          ctx.restore();
        }
      });
      ctx.fillStyle = 'white';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${circuit}${qubitIdx}`, centerX, centerY + 3);
    };

    if (quantumCircuitA && qubitStatesA.length > 0) {
      qubitStatesA.forEach((probData, qubitIdx) => drawQubit(probData, qubitIdx, 'A'));
    }

    if (quantumCircuitB && circuitBEnabled && qubitStatesB.length > 0) {
      qubitStatesB.forEach((probData, qubitIdx) => drawQubit(probData, qubitIdx, 'B'));
    }

    if (interCircuitEntanglementEnabled && quantumCircuitA && quantumCircuitB && framework) {
      interCircuitEntanglement.forEach(([aQubit, bQubit]) => {
        const aX = (0.15 + 0.12 * aQubit) * width;
        const aY = 0.25 * height;
        const bX = (0.15 + 0.12 * bQubit) * width;
        const bY = 0.75 * height;
        
        ctx.save();
        const pulse = 0.6 + 0.4 * Math.sin(framework.time * 2);
        ctx.shadowColor = 'rgba(255, 100, 255, 1)';
        ctx.shadowBlur = 20;

        ctx.strokeStyle = `rgba(255, 100, 255, ${0.4 * pulse})`;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(aX, aY);
        ctx.lineTo(bX, bY);
        ctx.stroke();

        ctx.strokeStyle = `rgba(255, 220, 255, ${0.9 * pulse})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(aX, aY);
        ctx.lineTo(bX, bY);
        ctx.stroke();
        
        ctx.restore();
      });
    }
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`t: ${framework.time.toFixed(1)}s`, 10, 20);
    ctx.fillText(`Dual Circuit: ${circuitBEnabled ? 'ON' : 'OFF'}`, 10, 35);
    ctx.fillText(`Inter-Entanglement: ${interCircuitEntanglementEnabled ? 'ON' : 'OFF'}`, 10, 50);
    if (quantumCircuitA) ctx.fillText(`System A |1⟩⁵: ${(quantumCircuitA.getSystemProbability() * 100).toFixed(2)}%`, 10, 65);
    if (quantumCircuitB) ctx.fillText(`System B |1⟩⁵: ${(quantumCircuitB.getSystemProbability() * 100).toFixed(2)}%`, 10, 80);
  };


  const renderQuantumCircuit = () => {
    if (!circuitCanvasRef.current) return;
    const canvas = circuitCanvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const width = canvas.width;
    const height = canvas.height;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);
    
    const drawCircuit = (circuit: QuantumCircuit, gates: SelectedGates, offsetY: number, circuitHeight: number, title: string) => {
        ctx.fillStyle = 'white';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(title, width/2, offsetY - 15);
        const qubitSpacing = circuitHeight / 6;
        const probs = circuit.getCurrentProbabilities();

        probs.forEach((probData, qubitIdx) => {
            const y = offsetY + qubitSpacing * (qubitIdx + 1);
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(20, y);
            ctx.lineTo(width - 20, y);
            ctx.stroke();
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`|${circuit.circuitId}${qubitIdx}⟩`, 15, y + 4);

            let gateX = 60;
            const gateWidth = 35;
            const gateHeight = 25;
            Object.entries(GATE_TYPES).forEach(([gateType, label]) => {
                if ((gates as any)[gateType][qubitIdx]) {
                    let gateColor = '#4a90e2';
                    if (gateType.includes('pauli')) gateColor = '#e24a4a';
                    if (gateType.includes('rotation')) gateColor = '#e2a04a';
                    if (gateType === 'tGate') gateColor = '#a04ae2';
                    ctx.fillStyle = gateColor;
                    ctx.fillRect(gateX - gateWidth/2, y - gateHeight/2, gateWidth, gateHeight);
                    ctx.fillStyle = 'white';
                    ctx.font = 'bold 11px Arial';
                    ctx.fillText(label, gateX, y + 3);
                    gateX += gateWidth + 10;
                }
            });

            const mX = width - 80;
            ctx.fillStyle = '#50c878';
            ctx.fillRect(mX - gateWidth/2, y - gateHeight/2, gateWidth, gateHeight);
            ctx.fillStyle = 'white';
            ctx.font = 'bold 14px Arial';
            ctx.fillText('M', mX, y + 4);
            const barX = mX + 50;
            const barWidth = 50;
            const barHeight = 16;
            ctx.fillStyle = '#333';
            ctx.fillRect(barX, y - barHeight/2, barWidth, barHeight);
            const probWidth = barWidth * probData.prob1;
            ctx.fillStyle = `hsl(${120 * probData.prob1}, 80%, 60%)`;
            ctx.fillRect(barX, y - barHeight/2, probWidth, barHeight);
            ctx.fillStyle = 'white';
            ctx.font = '9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${(probData.prob1 * 100).toFixed(1)}%`, barX + barWidth/2, y + 2);
        });

        const maxSingleGates = Math.max(...Array.from({length: 5}, (_, i) => Object.keys(GATE_TYPES).reduce((count, gateType) => count + ((gates as any)[gateType][i] ? 1 : 0), 0)));
        let currentMultiGateX = 60 + maxSingleGates * 45 + 20;

        if (gates.swap.some(s => s)) {
          gates.swap.forEach((isSwap, i) => {
              if (isSwap) {
                  const y1 = offsetY + qubitSpacing * (i + 1);
                  const y2 = offsetY + qubitSpacing * (i + 2);
                  ctx.strokeStyle = '#87CEEB';
                  ctx.lineWidth = 2;
                  ctx.beginPath();
                  ctx.moveTo(currentMultiGateX, y1);
                  ctx.lineTo(currentMultiGateX, y2);
                  ctx.stroke();
                  ctx.lineWidth = 1.5;
                  const drawCross = (y: number) => {
                      ctx.beginPath(); ctx.moveTo(currentMultiGateX - 4, y - 4); ctx.lineTo(currentMultiGateX + 4, y + 4); ctx.stroke();
                      ctx.beginPath(); ctx.moveTo(currentMultiGateX - 4, y + 4); ctx.lineTo(currentMultiGateX + 4, y - 4); ctx.stroke();
                  };
                  drawCross(y1);
                  drawCross(y2);
              }
          });
          currentMultiGateX += 40;
        }

        if (gates.ccnot.some(c => c)) {
          gates.ccnot.forEach((isCCNOT, i) => {
              if (isCCNOT) {
                  const c1 = i, c2 = i + 1, t = i + 2;
                  const y1 = offsetY + qubitSpacing * (c1 + 1);
                  const y2 = offsetY + qubitSpacing * (c2 + 1);
                  const y3 = offsetY + qubitSpacing * (t + 1);

                  ctx.strokeStyle = '#f6ad55'; // orange
                  ctx.lineWidth = 2;
                  ctx.beginPath();
                  ctx.moveTo(currentMultiGateX, y1);
                  ctx.lineTo(currentMultiGateX, y3);
                  ctx.stroke();

                  ctx.fillStyle = '#f6ad55';
                  ctx.beginPath(); ctx.arc(currentMultiGateX, y1, 4, 0, 2 * Math.PI); ctx.fill();
                  ctx.beginPath(); ctx.arc(currentMultiGateX, y2, 4, 0, 2 * Math.PI); ctx.fill();

                  ctx.strokeStyle = '#f6ad55';
                  ctx.lineWidth = 2;
                  ctx.beginPath(); ctx.arc(currentMultiGateX, y3, 10, 0, 2 * Math.PI); ctx.stroke();
                  ctx.beginPath(); ctx.moveTo(currentMultiGateX - 6, y3); ctx.lineTo(currentMultiGateX + 6, y3); ctx.stroke();
                  ctx.beginPath(); ctx.moveTo(currentMultiGateX, y3 - 6); ctx.lineTo(currentMultiGateX, y3 + 6); ctx.stroke();
              }
          });
          currentMultiGateX += 40;
        }
    };

    if (quantumCircuitA) {
        drawCircuit(quantumCircuitA, selectedGatesA, 40, circuitBEnabled ? height / 2 - 20 : height - 40, 'Circuit A');
    }
    if (quantumCircuitB && circuitBEnabled) {
        drawCircuit(quantumCircuitB, selectedGatesB, height / 2 + 30, height / 2 - 40, 'Circuit B');
    }

    if (interCircuitEntanglementEnabled && quantumCircuitA && quantumCircuitB) {
        const connectionX = width - 200;
        const qubitSpacingA = (circuitBEnabled ? height / 2 - 20 : height - 40) / 6;
        const qubitSpacingB = (height / 2 - 40) / 6;
        interCircuitEntanglement.forEach(([aQubit, bQubit]) => {
            const y1 = 40 + qubitSpacingA * (aQubit + 1);
            const y2 = height / 2 + 30 + qubitSpacingB * (bQubit + 1);
            ctx.strokeStyle = '#ff6bff'; ctx.lineWidth = 4; ctx.setLineDash([8, 8]);
            ctx.beginPath(); ctx.moveTo(connectionX, y1); ctx.lineTo(connectionX, y2); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#ff6bff';
            ctx.beginPath(); ctx.arc(connectionX, y1, 4, 0, 2 * Math.PI); ctx.fill();
            ctx.beginPath(); ctx.arc(connectionX, y2, 4, 0, 2 * Math.PI); ctx.fill();
        });
    }

    ctx.fillStyle = 'white'; ctx.font = '11px monospace'; ctx.textAlign = 'left';
    if (measurementResultsA.length > 0) {
      ctx.fillText('Circuit A measure:', 10, height - 50);
      ctx.fillText(`|${measurementResultsA.join('')}⟩`, 10, height - 35);
    }
    if (measurementResultsB.length > 0 && circuitBEnabled) {
      ctx.fillText('Circuit B measure:', 200, height - 50);
      ctx.fillText(`|${measurementResultsB.join('')}⟩`, 200, height - 35);
    }
  };

  useEffect(() => {
    if (framework && quantumCircuitA) {
      setTimeout(() => {
        renderVisualization();
        renderQuantumCircuit();
      }, 100);
    }
  }, [framework, quantumCircuitA, quantumCircuitB, circuitBEnabled]);

  const toggleSimulation = () => setIsRunning(!isRunning);

  const resetSimulation = () => {
    setIsRunning(false);
    setCurrentTime(0);
    setMetricsHistory([]);
    setPhaseVector({ x: 0, y: 0 });
    setReconstructionData(null);
    setAiAnalysis('');
    if (quantumCircuitA) quantumCircuitA.resetCircuit();
    if (quantumCircuitB) quantumCircuitB.resetCircuit();
    setMeasurementResultsA([]);
    setMeasurementResultsB([]);
    const circuitA = new QuantumCircuit(5, 'A', selectedGatesA);
    setQuantumCircuitA(circuitA);
    let circuitB = null;
    if (circuitBEnabled) {
      circuitB = new QuantumCircuit(5, 'B', selectedGatesB);
      setQuantumCircuitB(circuitB);
      if (interCircuitEntanglementEnabled) {
        const connections = [[2, 2]];
        circuitA.createInterCircuitEntanglement(circuitB, connections);
      }
    }
    setFramework(new QuantumLaminarFlow(GRID_SIZE, [10.0, 10.0], circuitA, circuitB));
  };
  
  const handleClearGates = () => {
    const freshGates = {
      ...initialGates,
      hadamard: [true, true, true, true, true],
    };
    setSelectedGatesA(freshGates);
    setSelectedGatesB(freshGates);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!framework) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    let closestQubit: any = null;
    let minDistance = Infinity;

    const checkQubits = (qubits: any[], circuit: 'A' | 'B') => {
      qubits.forEach((q, idx) => {
        const isB = circuit === 'B';
        const centerX = (0.15 + 0.12 * idx) * canvas.width;
        const centerY = (circuitBEnabled ? (isB ? 0.75 : 0.25) : 0.5) * canvas.height;
        const distance = Math.sqrt((x - centerX)**2 + (y - centerY)**2);
        if (distance < minDistance) {
          minDistance = distance;
          closestQubit = { ...q, circuit, idx };
        }
      });
    };

    if (qubitStatesA.length > 0) checkQubits(qubitStatesA, 'A');
    if (circuitBEnabled && qubitStatesB.length > 0) checkQubits(qubitStatesB, 'B');

    if (closestQubit && minDistance < 40) { // Detection radius of 40px
      const q = closestQubit;
      const content = `Qubit ${q.circuit}${q.idx} | P(|1⟩): ${(q.prob1 * 100).toFixed(1)}% | Phase: ${q.phase.toFixed(2)}`;
      setTooltip({ x: event.clientX - rect.left + 15, y: event.clientY - rect.top, content });
    } else {
      setTooltip(null);
    }
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };


  const performMeasurement = () => {
    if (quantumCircuitA) {
      const resultsA = quantumCircuitA.measureAll();
      setMeasurementResultsA(resultsA);
      setQubitStatesA(quantumCircuitA.getCurrentProbabilities() as any);
    }
    if (quantumCircuitB && circuitBEnabled) {
      const resultsB = quantumCircuitB.measureAll();
      setMeasurementResultsB(resultsB);
      setQubitStatesB(quantumCircuitB.getCurrentProbabilities() as any);
    }
  };

  const handleReconstruction = () => {
    if (!quantumCircuitA) return;

    const convertToCircuitType = (qc: QuantumCircuit): CircuitType => {
        const qubits: QubitType[] = qc.qubits.map((q, idx) => ({
            id: idx,
            amplitude: Math.abs(q.state[1]),
            phase: q.phase,
            coherence: 1.0,
        }));
        return { id: qc.circuitId, qubits };
    };

    const circuitA_typed = convertToCircuitType(quantumCircuitA);
    const circuitB_typed = circuitBEnabled && quantumCircuitB 
        ? convertToCircuitType(quantumCircuitB)
        : { id: 'B', qubits: Array.from({length: 5}, (_, i) => ({ id: i, amplitude: 0, phase: 0, coherence: 1.0 })) };

    const fragmentationSystem = createWormholeFragmentationSystem(circuitA_typed, circuitB_typed);
    const results = reconstructWithWormholeGeometry(fragmentationSystem);
    setReconstructionData(results);
  };

  const handleAiAnalysis = async () => {
    if (!process.env.API_KEY) {
      setAiAnalysis("Error: La API Key de Gemini no está configurada.");
      return;
    }
    setIsAnalyzing(true);
    setAiAnalysis('');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `
Actúa como un físico cuántico experto analizando los resultados de una nueva sesión de un simulador de circuitos cuánticos duales a través de un wormhole. A continuación se presentan los datos de la simulación. Proporciona un análisis conciso en formato markdown.

**Configuración de la Simulación:**
- **Circuito Dual:** ${circuitBEnabled ? 'Activado' : 'Desactivado'}
- **Entrelazamiento Inter-Circuito:** ${interCircuitEntanglementEnabled ? 'Activado' : 'Desactivado'}
- **Configuración de Puertas (Circuito A):** ${JSON.stringify(selectedGatesA, null, 2)}
- **Configuración de Puertas (Circuito B):** ${circuitBEnabled ? JSON.stringify(selectedGatesB, null, 2) : 'N/A'}

**Métricas de Coherencia (Resumen):**
- **Coherencia de Fase (Final):** ${metricsHistory.length > 0 ? Math.sqrt(phaseVector.x**2 + phaseVector.y**2).toFixed(4) : 'N/A'}
- **Longitud de Coherencia (Final):** ${metricsHistory.length > 0 ? metricsHistory[metricsHistory.length - 1].streamlineCoherence.toFixed(4) : 'N/A'}

**Resultados de Reconstrucción del Wormhole:**
- **Tunelización Promedio:** ${reconstructionData ? (reconstructionData.average_tunneling * 100).toFixed(2) + '%' : 'N/A'}
${reconstructionData ? `
- **Eficiencia del Wormhole:** ${(reconstructionData.wormhole_efficiency * 100).toFixed(2)}%
- **Fidelidad Circuito A:** ${(reconstructionData.circuit_A.wormhole_fidelity * 100).toFixed(2)}%
- **Fidelidad Circuito B:** ${circuitBEnabled ? (reconstructionData.circuit_B.wormhole_fidelity * 100).toFixed(2) + '%' : 'N/A'}
` : 'Aún no se ha realizado la reconstrucción.'}

**Análisis Solicitado:**
1.  **Interpretación General:** Basado en la configuración de las puertas y la tunelización, ¿qué tipo de estado cuántico se está intentando crear? ¿Es un estado altamente entrelazado o caótico?
2.  **Análisis de Métricas:** Explica el comportamiento de la "Coherencia de Fase", la "Longitud de Coherencia" y la "Tunelización Promedio". ¿Cómo se relacionan entre sí en esta simulación?
3.  **Análisis de la Reconstrucción:** Analiza los resultados de la reconstrucción (fidelidad, eficiencia). ¿Son consistentes con el nivel de tunelización observado? ¿Hay alguna anomalía?
4.  **Conclusión y Sugerencias:** Ofrece una conclusión sobre el estado del sistema y sugiere qué parámetros podrían modificarse para exploraciones futuras (ej. para maximizar la fidelidad o la tunelización).
`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      setAiAnalysis(response.text);

    } catch (error) {
      console.error("Error al analizar con IA:", error);
      setAiAnalysis("Ocurrió un error al contactar con el modelo de IA. Por favor, inténtalo de nuevo.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleGate = (circuit: 'A' | 'B', gateType: string, qubitIdx: number) => {
    const setter = circuit === 'A' ? setSelectedGatesA : setSelectedGatesB;
    setter(prev => ({ ...prev, [gateType]: (prev as any)[gateType].map((gate: boolean, idx: number) => idx === qubitIdx ? !gate : gate) }));
  };

  const toggleSwapGate = (circuit: 'A' | 'B', pairIdx: number) => {
    const setter = circuit === 'A' ? setSelectedGatesA : setSelectedGatesB;
    setter(prev => ({ ...prev, swap: prev.swap.map((gate, idx) => idx === pairIdx ? !gate : gate) }));
  };

  const toggleCCNOTGate = (circuit: 'A' | 'B', pairIdx: number) => {
    const setter = circuit === 'A' ? setSelectedGatesA : setSelectedGatesB;
    setter(prev => ({ ...prev, ccnot: prev.ccnot.map((gate, idx) => idx === pairIdx ? !gate : gate) }));
  };

  const handleGenerateSeed = () => {
    const state = {
        selectedGatesA,
        selectedGatesB,
        circuitBEnabled,
        interCircuitEntanglementEnabled,
    };
    try {
        const jsonString = JSON.stringify(state);
        const seed = btoa(jsonString);
        setGeneratedSeed(seed);
    } catch (error) {
        console.error("Error generating seed:", error);
        setGeneratedSeed("Error: No se pudo generar la semilla.");
    }
  };

  const handleLoadSeed = () => {
    if (!seedInput) return;
    try {
        const jsonString = atob(seedInput);
        const state = JSON.parse(jsonString);
        
        setIsRunning(false);

        // Set the configuration from the seed
        setSelectedGatesA(state.selectedGatesA);
        setSelectedGatesB(state.selectedGatesB);
        setCircuitBEnabled(state.circuitBEnabled);
        setInterCircuitEntanglementEnabled(state.interCircuitEntanglementEnabled);
        
        // Reset the dynamic state to run the simulation from t=0
        setCurrentTime(0);
        setMetricsHistory([]);
        setReconstructionData(null);
        setMeasurementResultsA([]);
        setMeasurementResultsB([]);
        setGeneratedSeed('');
        setAiAnalysis('');

    } catch (error) {
        console.error("Error loading seed:", error);
        alert("Semilla inválida o corrupta.");
    }
  };

  const handleExport = () => {
    const results = {
        simulationTime: currentTime.toFixed(2),
        gateConfiguration: {
            circuitA: selectedGatesA,
            circuitB: circuitBEnabled ? selectedGatesB : 'Disabled',
            interCircuitEntanglement: interCircuitEntanglementEnabled,
        },
        lastMeasurement: {
            circuitA: `|${measurementResultsA.join('')}⟩`,
            circuitB: circuitBEnabled ? `|${measurementResultsB.join('')}⟩` : 'N/A',
        },
        coherenceHistory: metricsHistory,
        wormholeReconstruction: reconstructionData,
        aiAnalysis: aiAnalysis || 'No analysis performed.'
    };
    setExportData(JSON.stringify(results, null, 2));
    setShowExportModal(true);
  };

  const ExportModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Resultados de la Simulación</h3>
                <button onClick={() => setShowExportModal(false)} className="text-gray-400 hover:text-white">&times;</button>
            </div>
            <textarea
                readOnly
                value={exportData}
                className="w-full flex-grow bg-gray-900 text-gray-300 font-mono text-xs p-3 rounded-md border border-gray-700 resize-none"
            ></textarea>
            <button onClick={() => navigator.clipboard.writeText(exportData)} className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm">
                Copiar al portapapeles
            </button>
        </div>
    </div>
  );

  return (
    <div className="w-full max-w-7xl mx-auto p-4 bg-gray-900 text-white">
      {showExportModal && <ExportModal />}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Network className="text-purple-400" />
          Circuitos Cuánticos Duales - Exploración Multidimensional
        </h1>
        <p className="text-gray-300">
          Sistema avanzado con elección de puertas opcionales y entrelazamiento inter-circuitos
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* --- LEFT COLUMN: SIMULATION VIEW & CONTROLS --- */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Flujo Cuántico (Cuadrícula 32x32)</h2>
              <div className="text-sm text-gray-400">t = {currentTime.toFixed(1)}s</div>
            </div>
             <div className="relative">
                <canvas 
                    ref={canvasRef} 
                    width="600" 
                    height="600" 
                    className="w-full h-auto bg-black rounded-lg border border-gray-700"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                />
                {tooltip && (
                    <div 
                        className="absolute bg-black bg-opacity-80 text-white text-xs font-mono p-2 rounded-md pointer-events-none z-10 shadow-lg"
                        style={{ left: `${tooltip.x}px`, top: `${tooltip.y}px`, transform: 'translateY(-100%)' }}
                    >
                        {tooltip.content}
                    </div>
                )}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4">Controles de Simulación</h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={toggleSimulation} className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${isRunning ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-green-600 hover:bg-green-700'}`}>
                {isRunning ? <><Pause size={18} /> Pausar</> : <><Play size={18} /> Iniciar</>}
              </button>
              <button onClick={resetSimulation} className="px-4 py-2 rounded-lg flex items-center gap-2 bg-red-600 hover:bg-red-700 transition-all">
                <RotateCcw size={18} /> Reiniciar
              </button>
               <button onClick={handleClearGates} className="px-4 py-2 rounded-lg flex items-center gap-2 bg-gray-600 hover:bg-gray-500 transition-all">
                <Eraser size={18} /> Limpiar Circuitos
              </button>
              <button onClick={performMeasurement} className="px-4 py-2 rounded-lg flex items-center gap-2 bg-blue-600 hover:bg-blue-700 transition-all">
                <Zap size={18} /> Medir
              </button>
              <button onClick={handleReconstruction} className="px-4 py-2 rounded-lg flex items-center gap-2 bg-purple-600 hover:bg-purple-700 transition-all">
                <Cpu size={18} /> Reconstruir
              </button>
               <button onClick={handleAiAnalysis} disabled={isAnalyzing} className="px-4 py-2 rounded-lg flex items-center gap-2 bg-pink-600 hover:bg-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                <Sparkles size={18} /> {isAnalyzing ? 'Analizando...' : 'Analizar con IA'}
              </button>
              <button onClick={handleExport} className="px-4 py-2 rounded-lg flex items-center gap-2 bg-teal-600 hover:bg-teal-700 transition-all">
                <Download size={18} /> Exportar
              </button>
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4">Monitores de Coherencia del Sistema</h3>
            <div className="flex flex-col sm:flex-row gap-4 h-56">
                <div className="flex-1">
                    <h4 className="text-sm text-center text-gray-400 mb-2">Coherencia de Fase (Vector Promedio)</h4>
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                            <CartesianGrid stroke="#4A5568" />
                            <XAxis type="number" dataKey="x" name="Real" domain={[-1.1, 1.1]} stroke="#A0AEC0" tick={{ fontSize: 9 }} />
                            <YAxis type="number" dataKey="y" name="Imag" domain={[-1.1, 1.1]} stroke="#A0AEC0" tick={{ fontSize: 9 }} />
                            <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#2D3748', border: '1px solid #4A5568' }} />
                            <ReferenceLine x={0} stroke="#666" />
                            <ReferenceLine y={0} stroke="#666" />
                            <Scatter name="Vector de Fase" data={[phaseVector]} fill="#9F7AEA" />
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex-1">
                    <h4 className="text-sm text-center text-gray-400 mb-2">Historial de Coherencia</h4>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={metricsHistory} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#4A5568" />
                            <XAxis dataKey="time" stroke="#A0AEC0" tick={{ fontSize: 10 }} unit="s" />
                            <YAxis stroke="#A0AEC0" tick={{ fontSize: 10 }} domain={[0, 'auto']} />
                            <Tooltip contentStyle={{ backgroundColor: '#2D3748', border: '1px solid #4A5568' }} />
                            <Legend wrapperStyle={{ fontSize: '12px' }} />
                            <Line type="monotone" dataKey="streamlineCoherence" name="Longitud de Coherencia" stroke="#4FD1C5" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
          </div>
        </div>
        
        {/* --- RIGHT COLUMN: CONFIGURATION & RESULTS --- */}
        <div className="lg:col-span-2 space-y-4">
           <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-4">Diagrama de Circuitos</h2>
            <canvas ref={circuitCanvasRef} width="600" height={circuitBEnabled ? 500 : 300} className="w-full h-auto bg-gray-800 rounded-lg border border-gray-700"></canvas>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-4">Configuración de Circuito y Puertas</h3>
             <div className="space-y-3 mb-6">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={circuitBEnabled} onChange={(e) => setCircuitBEnabled(e.target.checked)} className="form-checkbox h-5 w-5 rounded bg-gray-700 border-gray-600 text-purple-600 focus:ring-purple-500" />
                <span>Habilitar Circuito B</span>
              </label>
              <label className={`flex items-center gap-3 cursor-pointer transition-opacity ${!circuitBEnabled && 'opacity-50'}`}>
                <input type="checkbox" disabled={!circuitBEnabled} checked={interCircuitEntanglementEnabled} onChange={(e) => setInterCircuitEntanglementEnabled(e.target.checked)} className="form-checkbox h-5 w-5 rounded bg-gray-700 border-gray-600 text-purple-600 focus:ring-purple-500" />
                <span>Entrelazamiento Inter-Circuitos (A2-B2)</span>
              </label>
            </div>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2 text-purple-300">Circuito A</h4>
                {Object.entries(GATE_TYPES).map(([gateType, label]) => (
                  <div key={`A-${gateType}`} className="grid grid-cols-6 items-center gap-1 mb-1">
                    <span className="col-span-1 text-sm">{label}</span>
                    {selectedGatesA[gateType as keyof typeof GATE_TYPES].map((isActive, i) => (
                      <button key={i} onClick={() => toggleGate('A', gateType, i)} className={`w-full h-6 rounded text-xs ${isActive ? 'bg-purple-600' : 'bg-gray-600 hover:bg-gray-500'}`}>A{i}</button>
                    ))}
                  </div>
                ))}
                <h5 className="font-medium mt-3 text-sm text-sky-300">Puertas SWAP (A)</h5>
                <div className="grid grid-cols-4 items-center gap-1 mt-1">
                    {selectedGatesA.swap.map((isActive, i) => (
                        <button key={i} onClick={() => toggleSwapGate('A', i)} className={`w-full h-6 rounded text-xs ${isActive ? 'bg-sky-500' : 'bg-gray-600 hover:bg-gray-500'}`}>{`${i}↔${i+1}`}</button>
                    ))}
                </div>
                 <h5 className="font-medium mt-3 text-sm text-orange-400">Puertas CCNOT (Toffoli) (A)</h5>
                <div className="grid grid-cols-3 items-center gap-1 mt-1">
                    {selectedGatesA.ccnot.map((isActive, i) => (
                        <button key={i} onClick={() => toggleCCNOTGate('A', i)} className={`w-full h-6 rounded text-xs ${isActive ? 'bg-orange-600' : 'bg-gray-600 hover:bg-gray-500'}`}>{`${i},${i+1}→${i+2}`}</button>
                    ))}
                </div>
              </div>
              {circuitBEnabled && (
                <div>
                  <h4 className="font-medium mb-2 text-green-300 mt-4">Circuito B</h4>
                  {Object.entries(GATE_TYPES).map(([gateType, label]) => (
                    <div key={`B-${gateType}`} className="grid grid-cols-6 items-center gap-1 mb-1">
                      <span className="col-span-1 text-sm">{label}</span>
                      {selectedGatesB[gateType as keyof typeof GATE_TYPES].map((isActive, i) => (
                        <button key={i} onClick={() => toggleGate('B', gateType, i)} className={`w-full h-6 rounded text-xs ${isActive ? 'bg-green-600' : 'bg-gray-600 hover:bg-gray-500'}`}>B{i}</button>
                      ))}
                    </div>
                  ))}
                  <h5 className="font-medium mt-3 text-sm text-sky-300">Puertas SWAP (B)</h5>
                  <div className="grid grid-cols-4 items-center gap-1 mt-1">
                    {selectedGatesB.swap.map((isActive, i) => (
                        <button key={i} onClick={() => toggleSwapGate('B', i)} className={`w-full h-6 rounded text-xs ${isActive ? 'bg-sky-500' : 'bg-gray-600 hover:bg-gray-500'}`}>{`${i}↔${i+1}`}</button>
                    ))}
                  </div>
                  <h5 className="font-medium mt-3 text-sm text-orange-400">Puertas CCNOT (Toffoli) (B)</h5>
                  <div className="grid grid-cols-3 items-center gap-1 mt-1">
                      {selectedGatesB.ccnot.map((isActive, i) => (
                          <button key={i} onClick={() => toggleCCNOTGate('B', i)} className={`w-full h-6 rounded text-xs ${isActive ? 'bg-orange-600' : 'bg-gray-600 hover:bg-gray-500'}`}>{`${i},${i+1}→${i+2}`}</button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold mb-3">Gestión de Estado (Semillas)</h3>
            <div className="space-y-3">
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={seedInput}
                        onChange={(e) => setSeedInput(e.target.value)}
                        placeholder="Pegar semilla para cargar"
                        className="flex-grow bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-purple-500 focus:border-purple-500"
                    />
                    <button onClick={handleLoadSeed} className="px-4 py-2 rounded-lg flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-sm">
                        <Upload size={16} /> Cargar
                    </button>
                </div>
                <button onClick={handleGenerateSeed} className="w-full px-4 py-2 rounded-lg flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-sm">
                    <Save size={16} /> Guardar Semilla
                </button>
                {generatedSeed && (
                    <textarea 
                        readOnly
                        value={generatedSeed}
                        className="w-full h-24 bg-gray-900 text-gray-300 font-mono text-xs p-2 rounded-md border border-gray-700 resize-none"
                        onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                    />
                )}
            </div>
          </div>

          {(reconstructionData) && (
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-3">Resultados de Reconstrucción</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Eficiencia del Wormhole:</span>
                  <span className="font-mono text-purple-300">{(reconstructionData.wormhole_efficiency * 100).toFixed(2)}%</span>
                </div>
                 <div className="flex justify-between">
                  <span className="text-gray-400">Tunelización Promedio:</span>
                  <span className="font-mono text-green-300">{(reconstructionData.average_tunneling * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Fidelidad Circuito A:</span>
                  <span className="font-mono text-purple-300">{(reconstructionData.circuit_A.wormhole_fidelity * 100).toFixed(2)}%</span>
                </div>
                {circuitBEnabled && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Fidelidad Circuito B:</span>
                    <span className="font-mono text-purple-300">{(reconstructionData.circuit_B.wormhole_fidelity * 100).toFixed(2)}%</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {(isAnalyzing || aiAnalysis) && (
            <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2"><Sparkles size={18} className="text-pink-400" />Análisis de IA</h3>
                {isAnalyzing && <div className="text-gray-400">El modelo Gemini está analizando los datos...</div>}
                {aiAnalysis && <AiAnalysisDisplay content={aiAnalysis} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuantumWormholeSimulator;