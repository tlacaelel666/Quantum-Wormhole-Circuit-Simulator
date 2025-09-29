import { PHYSICAL_CONSTANTS, WORMHOLE_CONFIG } from '../constants';
import type { Circuit, FragmentationSystem, QuantumWormholeType, ReconstructionResult, ReconstructedQubit } from '../types';

// Simplified Dirac matrices for visualization
const getDiracMatrices = () => ({
  alpha_x: [[0, 1], [1, 0]],
  alpha_y: [[0, -1], [1, 0]], // Simplified for visualization
  beta: [[1, 0], [0, -1]],
  gamma: [
    [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, -1, 0], [0, 0, 0, -1]],
    [[0, 0, 0, 1], [0, 0, 1, 0], [0, -1, 0, 0], [-1, 0, 0, 0]]
  ]
});

// Quantum Wormhole Model
export class QuantumWormhole implements QuantumWormholeType {
  config: typeof WORMHOLE_CONFIG;
  throat_geometry;
  spacetime_curvature;
  majorana_field;

  constructor(config = WORMHOLE_CONFIG) {
    this.config = config;
    this.throat_geometry = this.calculateThroatGeometry();
    this.spacetime_curvature = this.calculateSpacetimeCurvature();
    this.majorana_field = this.initializeMajoranaField();
  }

  calculateThroatGeometry() {
    const points = [];
    const throat_radius = this.config.wormhole_distance;
    
    for (let i = 0; i < this.config.num_points; i++) {
      const z = (i / this.config.num_points - 0.5) * 10 * throat_radius;
      const rho_z = throat_radius * Math.sqrt(1 + (z / throat_radius)**2);
      
      points.push({
        z: z,
        radius: rho_z,
        curvature: 1 / (throat_radius * (1 + (z / throat_radius)**2)**(3/2)),
        energy_density: this.config.dark_energy * Math.exp(-Math.abs(z) / throat_radius)
      });
    }
    return points;
  }

  calculateSpacetimeCurvature() {
    return this.throat_geometry.map(point => ({
      ...point,
      einstein_tensor: PHYSICAL_CONSTANTS.EINSTEIN_CONSTANT * point.energy_density,
      ricci_scalar: 2 * point.curvature,
      stress_energy: point.energy_density / (PHYSICAL_CONSTANTS.C**2)
    }));
  }

  initializeMajoranaField() {
    return this.throat_geometry.map((point, i) => {
      const phase = 2 * Math.PI * i / this.config.num_points;
      const amplitude = Math.exp(-Math.abs(point.z) / this.config.wormhole_distance);
      
      return {
        position: point.z,
        amplitude: amplitude,
        phase: phase,
        spinor: [
          amplitude * Math.cos(phase / 2),
          amplitude * Math.sin(phase / 2),
          -amplitude * Math.sin(phase / 2),
          amplitude * Math.cos(phase / 2)
        ],
        mass_term: this.config.majorana_mass * amplitude
      };
    });
  }

  calculateQuantumTunnelingProbability(energy_state: { amplitude: number }) {
    const barrier_height = Math.abs(this.config.dark_energy);
    const particle_energy = energy_state.amplitude * PHYSICAL_CONSTANTS.HBAR * PHYSICAL_CONSTANTS.C;
    
    if (particle_energy > barrier_height) {
      return 0.98;
    } else {
      const kappa = Math.sqrt(2 * (barrier_height - particle_energy)) / PHYSICAL_CONSTANTS.HBAR;
      const barrier_width = 2 * this.config.wormhole_distance;
      return Math.exp(-2 * kappa * barrier_width);
    }
  }
}

// Quantum Fragmentation System Integration
export const createWormholeFragmentationSystem = (circuitA: Circuit, circuitB: Circuit): FragmentationSystem => {
  const wormhole = new QuantumWormhole();
  const fragmentedStates = [];
  
  for (let i = 0; i < 1024; i++) {
    const wormhole_point = wormhole.spacetime_curvature[i % wormhole.spacetime_curvature.length];
    const majorana_field = wormhole.majorana_field[i % wormhole.majorana_field.length];
    const geometric_factor = wormhole_point.radius / WORMHOLE_CONFIG.wormhole_distance;
    const alpha = Math.cos(Math.PI * i / 2048) * Math.sqrt(geometric_factor);
    const beta = Math.sin(Math.PI * i / 2048) * Math.sqrt(geometric_factor);
    
    const quantum_state = {
      id: i,
      wormhole_position: wormhole_point.z,
      alpha,
      beta,
      geometric_phase: majorana_field.phase,
      tunneling_probability: wormhole.calculateQuantumTunnelingProbability({
        amplitude: Math.sqrt(alpha*alpha + beta*beta)
      }),
      qubits: [
        ...circuitA.qubits.map((qubit) => ({
          ...qubit,
          amplitude: qubit.amplitude * alpha * majorana_field.amplitude,
          phase: qubit.phase + majorana_field.phase + wormhole_point.curvature,
          wormhole_coupling: wormhole_point.energy_density,
          spacetime_correction: wormhole_point.einstein_tensor
        })),
        ...circuitB.qubits.map((qubit) => ({
          ...qubit,
          id: qubit.id + 5,
          amplitude: qubit.amplitude * beta * majorana_field.amplitude,
          phase: qubit.phase - majorana_field.phase - wormhole_point.curvature,
          wormhole_coupling: -wormhole_point.energy_density,
          spacetime_correction: -wormhole_point.einstein_tensor
        }))
      ],
      fragment_coords: {
        x: i % 32,
        y: Math.floor(i / 32),
        wormhole_sector: Math.floor(i / 256)
      }
    };
    fragmentedStates.push(quantum_state);
  }
  
  return {
    wormhole: wormhole,
    fragmented_states: fragmentedStates,
    total_energy: fragmentedStates.reduce((sum, state) => 
      sum + state.qubits.reduce((qsum, q) => qsum + q.amplitude * q.amplitude, 0), 0),
    average_tunneling: fragmentedStates.reduce((sum, state) => 
      sum + state.tunneling_probability, 0) / 1024,
    geometric_coherence: fragmentedStates.filter(state => 
      state.tunneling_probability > 0.5).length / 1024
  };
};

// Reconstruction using wormhole geometry
export const reconstructWithWormholeGeometry = (fragmentationSystem: FragmentationSystem): ReconstructionResult => {
  const { wormhole, fragmented_states, average_tunneling } = fragmentationSystem;
  
  const reconstructed_A = { qubits: [] as (ReconstructedQubit & {contributing_fragment_ids?: number[]})[], wormhole_fidelity: 0 };
  const reconstructed_B = { qubits: [] as (ReconstructedQubit & {contributing_fragment_ids?: number[]})[], wormhole_fidelity: 0 };
  
  for (let qubit_idx = 0; qubit_idx < 5; qubit_idx++) {
    let qubit_A_reconstruction = { amplitude: 0, phase: 0, coherence: 0, geometric_weight: 0, wormhole_contributions: [] as number[], contributing_fragment_ids: [] as number[] };
    let qubit_B_reconstruction = { amplitude: 0, phase: 0, coherence: 0, geometric_weight: 0, wormhole_contributions: [] as number[], contributing_fragment_ids: [] as number[] };
    
    fragmented_states.forEach(state => {
      // MODIFICATION: The geometric weight is now based only on tunneling probability,
      // avoiding scaling issues from ultra-small wormhole_position values.
      const geometric_weight = state.tunneling_probability;
      
      if (state.alpha > 0.3) {
        const qubit_A = state.qubits[qubit_idx];
        qubit_A_reconstruction.amplitude += qubit_A.amplitude * state.alpha * geometric_weight;
        qubit_A_reconstruction.phase += qubit_A.phase * state.alpha * geometric_weight;
        qubit_A_reconstruction.geometric_weight += state.alpha * geometric_weight;
        qubit_A_reconstruction.wormhole_contributions.push(state.wormhole_position);
        qubit_A_reconstruction.contributing_fragment_ids.push(state.id);
      }
      
      if (state.beta > 0.3) {
        const qubit_B = state.qubits[qubit_idx + 5];
        qubit_B_reconstruction.amplitude += qubit_B.amplitude * state.beta * geometric_weight;
        qubit_B_reconstruction.phase += qubit_B.phase * state.beta * geometric_weight;
        qubit_B_reconstruction.geometric_weight += state.beta * geometric_weight;
        qubit_B_reconstruction.wormhole_contributions.push(state.wormhole_position);
        qubit_B_reconstruction.contributing_fragment_ids.push(state.id);
      }
    });
    
    if (qubit_A_reconstruction.geometric_weight > 0) {
      qubit_A_reconstruction.amplitude /= qubit_A_reconstruction.geometric_weight;
      qubit_A_reconstruction.phase /= qubit_A_reconstruction.geometric_weight;
      // MODIFICATION: Use tanh for a normalized coherence value between 0 and 1,
      // preventing negative fidelities. The divisor scales the input.
      qubit_A_reconstruction.coherence = Math.tanh(qubit_A_reconstruction.geometric_weight / 100);
    }
    
    if (qubit_B_reconstruction.geometric_weight > 0) {
      qubit_B_reconstruction.amplitude /= qubit_B_reconstruction.geometric_weight;
      qubit_B_reconstruction.phase /= qubit_B_reconstruction.geometric_weight;
      qubit_B_reconstruction.coherence = Math.tanh(qubit_B_reconstruction.geometric_weight / 100);
    }
    
    reconstructed_A.qubits.push(qubit_A_reconstruction);
    reconstructed_B.qubits.push(qubit_B_reconstruction);
  }
  
  reconstructed_A.wormhole_fidelity = reconstructed_A.qubits.reduce((sum, q) => sum + q.coherence, 0) / 5;
  reconstructed_B.wormhole_fidelity = reconstructed_B.qubits.reduce((sum, q) => sum + q.coherence, 0) / 5;

  // NEW: Calculate exploration factor based on the spread of contributing fragments.
  // This rewards simulations that explore a wider range of the wormhole spectrum.
  const calculateExplorationFactor = (qubits: (ReconstructedQubit & {contributing_fragment_ids?: number[]})[]): number => {
    const all_fragment_ids = qubits.flatMap(q => q.contributing_fragment_ids || []);
    if (all_fragment_ids.length < 20) return 0; // Not enough data for meaningful variance
    
    // Use a dimensionless position for stable variance calculation
    const norm_positions = all_fragment_ids.map(id => (id / WORMHOLE_CONFIG.num_points - 0.5) * 10);
    const mean = norm_positions.reduce((a, b) => a + b, 0) / norm_positions.length;
    const variance = norm_positions.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / norm_positions.length;

    // Normalize variance. Max variance for a uniform distribution on [-5, 5] is ~8.33.
    // We normalize by 8.0 to give a score around 1.0 for high exploration.
    return Math.min(1.0, variance / 8.0);
  };
  
  const exploration_A = calculateExplorationFactor(reconstructed_A.qubits);
  const exploration_B = calculateExplorationFactor(reconstructed_B.qubits);
  const average_exploration = (exploration_A + exploration_B) / 2;

  const average_fidelity = (reconstructed_A.wormhole_fidelity + reconstructed_B.wormhole_fidelity) / 2;
  
  // MODIFICATION: The final efficiency metric now combines fidelity with the exploration factor.
  // This aligns with the user's view of oscillation and exploration as a positive mechanism for a QNN.
  const wormhole_efficiency = 0.7 * average_fidelity + 0.3 * average_exploration;
  
  return {
    circuit_A: reconstructed_A,
    circuit_B: reconstructed_B,
    wormhole_efficiency,
    average_tunneling,
    geometric_corrections: wormhole.spacetime_curvature.slice(0, 10).map(point => ({
      position: point.z,
      curvature: point.ricci_scalar,
      energy: point.stress_energy
    }))
  };
};