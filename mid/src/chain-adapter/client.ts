import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  type Hex,
  type Log,
  type ParseEventLogsReturnType,
  type PublicClient,
  type WalletClient
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { defineChain } from "viem/utils";
import type { Env } from "../config/env.js";
import {
  feeVaultAbi,
  gameWorldAbi,
  itemsAbi,
  mmoTokenAbi,
  rfqMarketAbi,
  tradeEscrowAbi
} from "../contracts/abi.js";

export interface ChainAddresses {
  gameWorld: Hex;
  feeVault: Hex;
  items: Hex;
  mmo: Hex;
  tradeEscrow: Hex;
  rfqMarket: Hex;
}

export interface DecodedLog {
  address: Hex;
  blockNumber: bigint;
  blockHash: Hex;
  logIndex: number;
  transactionHash: Hex;
  eventName: string;
  args: Record<string, unknown>;
}

export interface WriteContractOptions {
  value?: bigint;
}

export interface FeeEstimate {
  maxFeePerGas: bigint;
  source: "eip1559" | "legacy";
}

export class ChainAdapter {
  public readonly publicClient: PublicClient;
  public readonly walletClient?: WalletClient;
  public readonly account?: ReturnType<typeof privateKeyToAccount>;
  public readonly onboardWalletClient?: WalletClient;
  public readonly onboardAccount?: ReturnType<typeof privateKeyToAccount>;
  public readonly addresses: ChainAddresses;

  public constructor(private readonly env: Env) {
    const chain = defineChain({
      id: env.CHAIN_ID,
      name: `chainmmo-${env.CHAIN_ID}`,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: {
        default: {
          http: [env.CHAIN_RPC_URL]
        }
      }
    });

    this.publicClient = createPublicClient({ chain, transport: http(env.CHAIN_RPC_URL) });
    if (env.MCP_STIPEND_WALLET_PRIVATE_KEY) {
      this.onboardAccount = privateKeyToAccount(env.MCP_STIPEND_WALLET_PRIVATE_KEY as Hex);
      this.onboardWalletClient = createWalletClient({
        chain,
        account: this.onboardAccount,
        transport: http(env.CHAIN_RPC_URL)
      });
    }

    if (env.SIGNER_PRIVATE_KEY) {
      this.account = privateKeyToAccount(env.SIGNER_PRIVATE_KEY as Hex);
      this.walletClient = createWalletClient({ chain, account: this.account, transport: http(env.CHAIN_RPC_URL) });
    }

    this.addresses = {
      gameWorld: env.GAMEWORLD_ADDRESS as Hex,
      feeVault: env.FEEVAULT_ADDRESS as Hex,
      items: env.ITEMS_ADDRESS as Hex,
      mmo: env.MMO_ADDRESS as Hex,
      tradeEscrow: env.TRADE_ESCROW_ADDRESS as Hex,
      rfqMarket: env.RFQ_MARKET_ADDRESS as Hex
    };
  }

  private requireWallet(): { walletClient: WalletClient; account: ReturnType<typeof privateKeyToAccount> } {
    if (!this.walletClient || !this.account) {
      throw new Error("wallet_client_unavailable");
    }
    return { walletClient: this.walletClient, account: this.account };
  }

  private requireOnboardWallet(): { walletClient: WalletClient; account: ReturnType<typeof privateKeyToAccount> } {
    if (!this.onboardWalletClient || !this.onboardAccount) {
      return this.requireWallet();
    }
    return { walletClient: this.onboardWalletClient, account: this.onboardAccount };
  }

  public async getBlockNumber(): Promise<bigint> {
    return this.publicClient.getBlockNumber();
  }

  public async getNativeBalance(address: Hex): Promise<bigint> {
    return this.publicClient.getBalance({ address });
  }

  public async getFeeEstimate(): Promise<FeeEstimate> {
    try {
      const fees = await this.publicClient.estimateFeesPerGas();
      if (fees.maxFeePerGas !== undefined) {
        return {
          maxFeePerGas: fees.maxFeePerGas,
          source: "eip1559"
        };
      }
      if (fees.gasPrice !== undefined) {
        return {
          maxFeePerGas: fees.gasPrice,
          source: "legacy"
        };
      }
    } catch {
      // Fallback below.
    }

    const gasPrice = await this.publicClient.getGasPrice();
    return {
      maxFeePerGas: gasPrice,
      source: "legacy"
    };
  }

  public async getSafeHead(): Promise<bigint> {
    const blockNumber = await this.publicClient.getBlockNumber();
    const confirmations = BigInt(this.env.CHAIN_CONFIRMATIONS);
    if (blockNumber <= confirmations) {
      return 0n;
    }
    return blockNumber - confirmations;
  }

  public isLocalChain(): boolean {
    return this.env.CHAIN_ID === 31337;
  }

  public async mineBlocks(count: number): Promise<void> {
    if (!this.isLocalChain()) {
      return;
    }
    if (count <= 0) {
      return;
    }
    for (let index = 0; index < count; index++) {
      await (this.publicClient.request as any)({ method: "evm_mine" });
    }
  }

  public async waitForBlock(target: bigint, timeoutMs = 60_000): Promise<void> {
    const started = Date.now();
    while (true) {
      const current = await this.publicClient.getBlockNumber();
      if (current >= target) {
        return;
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error("wait_block_timeout");
      }
      if (this.isLocalChain()) {
        const remaining = target - current;
        if (remaining > 16n) {
          throw new Error(`wait_block_target_too_far:${remaining.toString()}`);
        }
        await this.mineBlocks(Number(remaining));
        continue;
      }
      await sleep(350);
    }
  }

  public async waitForReceipt(hash: Hex) {
    return this.publicClient.waitForTransactionReceipt({ hash });
  }

  public async sendNativeCurrency(recipient: Hex, amountWei: bigint): Promise<Hex> {
    const { walletClient, account } = this.requireOnboardWallet();
    return walletClient.sendTransaction({
      account,
      to: recipient,
      value: amountWei
    } as any);
  }

  public async readGameWorld<T>(functionName: string, args: unknown[] = []): Promise<T> {
    const result = await this.publicClient.readContract({
      address: this.addresses.gameWorld,
      abi: gameWorldAbi,
      functionName,
      args
    } as any);
    return result as T;
  }

  public async writeGameWorld(
    functionName: string,
    args: unknown[] = [],
    options: WriteContractOptions = {}
  ): Promise<Hex> {
    const { walletClient, account } = this.requireWallet();
    return walletClient.writeContract({
      address: this.addresses.gameWorld,
      abi: gameWorldAbi,
      functionName,
      args,
      value: options.value,
      account
    } as any);
  }

  public async readFeeVault<T>(functionName: string, args: unknown[] = []): Promise<T> {
    const result = await this.publicClient.readContract({
      address: this.addresses.feeVault,
      abi: feeVaultAbi,
      functionName,
      args
    } as any);
    return result as T;
  }

  public async writeFeeVault(
    functionName: string,
    args: unknown[] = [],
    options: WriteContractOptions = {}
  ): Promise<Hex> {
    const { walletClient, account } = this.requireWallet();
    return walletClient.writeContract({
      address: this.addresses.feeVault,
      abi: feeVaultAbi,
      functionName,
      args,
      value: options.value,
      account
    } as any);
  }

  public async readItems<T>(functionName: string, args: unknown[] = []): Promise<T> {
    const result = await this.publicClient.readContract({
      address: this.addresses.items,
      abi: itemsAbi,
      functionName,
      args
    } as any);
    return result as T;
  }

  public async readItemsApprovalForAll(owner: Hex, operator: Hex): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.addresses.items,
      abi: itemsAbi,
      functionName: "isApprovedForAll",
      args: [owner, operator]
    });
  }

  public async writeItemsSetApprovalForAll(operator: Hex, approved: boolean): Promise<Hex> {
    const { walletClient, account } = this.requireWallet();
    return walletClient.writeContract({
      address: this.addresses.items,
      abi: itemsAbi,
      functionName: "setApprovalForAll",
      args: [operator, approved],
      account
    } as any);
  }

  public async readMmoBalance(address: Hex): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.addresses.mmo,
      abi: mmoTokenAbi,
      functionName: "balanceOf",
      args: [address]
    });
  }

  public async readMmoAllowance(owner: Hex, spender: Hex): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.addresses.mmo,
      abi: mmoTokenAbi,
      functionName: "allowance",
      args: [owner, spender]
    });
  }

  public async writeMmoApprove(spender: Hex, amount: bigint): Promise<Hex> {
    const { walletClient, account } = this.requireWallet();
    return walletClient.writeContract({
      address: this.addresses.mmo,
      abi: mmoTokenAbi,
      functionName: "approve",
      args: [spender, amount],
      account
    } as any);
  }

  public async writeRfq(
    functionName: string,
    args: unknown[] = [],
    options: WriteContractOptions = {}
  ): Promise<Hex> {
    const { walletClient, account } = this.requireWallet();
    return walletClient.writeContract({
      address: this.addresses.rfqMarket,
      abi: rfqMarketAbi,
      functionName,
      args,
      value: options.value,
      account
    } as any);
  }

  public async readRfq<T>(functionName: string, args: unknown[] = []): Promise<T> {
    const result = await this.publicClient.readContract({
      address: this.addresses.rfqMarket,
      abi: rfqMarketAbi,
      functionName,
      args
    } as any);
    return result as T;
  }

  public async writeTradeEscrow(
    functionName: string,
    args: unknown[] = [],
    options: WriteContractOptions = {}
  ): Promise<Hex> {
    const { walletClient, account } = this.requireWallet();
    return walletClient.writeContract({
      address: this.addresses.tradeEscrow,
      abi: tradeEscrowAbi,
      functionName,
      args,
      value: options.value,
      account
    } as any);
  }

  public async readTradeEscrow<T>(functionName: string, args: unknown[] = []): Promise<T> {
    const result = await this.publicClient.readContract({
      address: this.addresses.tradeEscrow,
      abi: tradeEscrowAbi,
      functionName,
      args
    } as any);
    return result as T;
  }

  public async estimateGameWorldGas(
    functionName: string,
    args: unknown[] = [],
    options: WriteContractOptions = {}
  ): Promise<bigint> {
    const { account } = this.requireWallet();
    return this.publicClient.estimateContractGas({
      address: this.addresses.gameWorld,
      abi: gameWorldAbi,
      functionName,
      args,
      value: options.value,
      account
    } as any);
  }

  public async estimateRfqGas(
    functionName: string,
    args: unknown[] = [],
    options: WriteContractOptions = {}
  ): Promise<bigint> {
    const { account } = this.requireWallet();
    return this.publicClient.estimateContractGas({
      address: this.addresses.rfqMarket,
      abi: rfqMarketAbi,
      functionName,
      args,
      value: options.value,
      account
    } as any);
  }

  public async estimateFeeVaultGas(
    functionName: string,
    args: unknown[] = [],
    options: WriteContractOptions = {}
  ): Promise<bigint> {
    const { account } = this.requireWallet();
    return this.publicClient.estimateContractGas({
      address: this.addresses.feeVault,
      abi: feeVaultAbi,
      functionName,
      args,
      value: options.value,
      account
    } as any);
  }

  public async estimateTradeEscrowGas(
    functionName: string,
    args: unknown[] = [],
    options: WriteContractOptions = {}
  ): Promise<bigint> {
    const { account } = this.requireWallet();
    return this.publicClient.estimateContractGas({
      address: this.addresses.tradeEscrow,
      abi: tradeEscrowAbi,
      functionName,
      args,
      value: options.value,
      account
    } as any);
  }

  public async getLogs(fromBlock: bigint, toBlock: bigint): Promise<Log[]> {
    return this.publicClient.getLogs({
      fromBlock,
      toBlock,
      address: [
        this.addresses.gameWorld,
        this.addresses.feeVault,
        this.addresses.items,
        this.addresses.rfqMarket,
        this.addresses.tradeEscrow
      ]
    });
  }

  public decodeLog(log: Log): DecodedLog | undefined {
    const address = (log.address as string).toLowerCase();
    const topic0 = log.topics[0];
    if (!topic0) {
      return undefined;
    }

    const parsed = decodeByAddress(address as Hex, log);
    if (!parsed) {
      return undefined;
    }

    return {
      address: log.address,
      blockNumber: log.blockNumber ?? 0n,
      blockHash: log.blockHash ?? "0x" as Hex,
      logIndex: Number(log.logIndex ?? 0),
      transactionHash: log.transactionHash ?? "0x" as Hex,
      eventName: parsed.eventName,
      args: Array.isArray(parsed.args) ? {} : (parsed.args as Record<string, unknown>)
    };
  }
}

function decodeByAddress(address: Hex, log: Log): ParseEventLogsReturnType[number] | undefined {
  try {
    const normalized = address.toLowerCase();
    if (normalized === (log.address as Hex).toLowerCase()) {
      // no-op, just explicit to keep address branch predictable
    }

    // decodeEventLog throws if log does not match ABI
    // We try each ABI based on emitting contract address upstream.
    return (
      tryDecode(gameWorldAbi, log) ??
      tryDecode(feeVaultAbi, log) ??
      tryDecode(itemsAbi, log) ??
      tryDecode(rfqMarketAbi, log) ??
      tryDecode(tradeEscrowAbi, log)
    );
  } catch {
    return undefined;
  }
}

function tryDecode(abi: readonly unknown[], log: Log): ParseEventLogsReturnType[number] | undefined {
  try {
    const decoded = decodeEventLog({
      abi,
      data: log.data,
      topics: log.topics,
      strict: false
    });
    return {
      ...log,
      eventName: decoded.eventName,
      args: decoded.args
    } as ParseEventLogsReturnType[number];
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
