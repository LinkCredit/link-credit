import { sepolia } from './sepolia'
import { tenderlySepoliaVirtualTestnet } from './tenderly'

// Export all chain definitions
export { sepolia, tenderlySepoliaVirtualTestnet }

// Chain metadata
export const CHAIN_METADATA = {
  11155111: {
    displayName: 'Sepolia',
    type: 'testnet' as const,
  },
  99911155111: {
    displayName: 'Tenderly (Sepolia Fork)',
    type: 'fork' as const,
  },
}
