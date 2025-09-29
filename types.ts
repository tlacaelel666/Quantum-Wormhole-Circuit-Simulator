
export interface Qubit {
  id: number;
  amplitude: number;
  phase: number;
  coherence: number;
  wormhole_coupling?: number;
  spacetime_correction?: number;
}

export interface Circuit {
  id: string;
  qubits: Qubit[];
}

export interface FragmentedState {
  id: number;
  wormhole_position: number;
  alpha: number;
  beta: number;
  geometric_phase: number;
  tunneling_probability: number;
  qubits: (Qubit & { id: number })[];
  fragment_coords: {
    x: number;
    y: number;
    wormhole_sector: number;
  };
}

export interface GeometryPoint {
    z: number;
    radius: number;
    curvature: number;
    energy_density: number;
}

export interface SpacetimePoint extends GeometryPoint {
    einstein_tensor: number;
    ricci_scalar: number;
    stress_energy: number;
}

export interface MajoranaFieldPoint {
    position: number;
    amplitude: number;
    phase: number;
    spinor: number[];
    mass_term: number;
}

export interface QuantumWormholeType {
  config: any;
  throat_geometry: GeometryPoint[];
  spacetime_curvature: SpacetimePoint[];
  majorana_field: MajoranaFieldPoint[];
  calculateQuantumTunnelingProbability(energy_state: { amplitude: number }): number;
}

export interface FragmentationSystem {
  wormhole: QuantumWormholeType;
  fragmented_states: FragmentedState[];
  total_energy: number;
  average_tunneling: number;
  geometric_coherence: number;
}

export interface ReconstructedQubit {
  amplitude: number;
  phase: number;
  coherence: number;
  geometric_weight: number;
  wormhole_contributions: number[];
}

export interface ReconstructedCircuit {
  qubits: ReconstructedQubit[];
  wormhole_fidelity: number;
}

export interface ReconstructionResult {
  circuit_A: ReconstructedCircuit;
  circuit_B: ReconstructedCircuit;
  wormhole_efficiency: number;
  average_tunneling: number;
  geometric_corrections: {
    position: number;
    curvature: number;
    energy: number;
  }[];
}

export interface WormholeMetrics {
  throat_radius: number;
  total_energy: number;
  tunneling_efficiency: number;
  geometric_coherence: number;
  majorana_coupling: number[];
  spacetime_points: SpacetimePoint[];
}

export type SimulationStep = 'idle' | 'creating_wormhole' | 'quantum_fragmentation' | 'wormhole_reconstruction' | 'completed';