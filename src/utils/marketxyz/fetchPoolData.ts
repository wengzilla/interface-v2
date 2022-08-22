import {
  PoolDirectoryV1,
  PoolAsset,
  Comptroller,
  Pool,
  PoolLensV1,
} from 'market-sdk';
import { convertBNToNumber } from 'utils';
import { getEthPrice } from '../index';

export interface USDPricedPoolAsset extends PoolAsset {
  supplyBalanceUSD: number;
  borrowBalanceUSD: number;

  totalSupplyUSD: number;
  totalBorrowUSD: number;

  liquidityUSD: number;

  isPaused: boolean;
  isSupplyPaused: boolean;
  usdPrice: number;
}

export const getPoolIdFromComptroller = async (
  comptroller: Comptroller | string,
  directory: PoolDirectoryV1,
) => {
  if (typeof comptroller === 'string') {
    comptroller = new Comptroller(directory.sdk, comptroller);
  }
  const pools = await directory.getAllPools();

  return pools
    .findIndex((pool) => {
      return pool.comptroller.address == (comptroller as Comptroller).address;
    })
    .toString();
};

export interface PoolData {
  poolId: string;
  pool: Pool;
  summary: any;
  assets: USDPricedPoolAsset[];
  totalLiquidityUSD: number;
  totalSuppliedUSD: number;
  totalBorrowedUSD: number;
  totalSupplyBalanceUSD: number;
  totalBorrowBalanceUSD: number;
}

export const fetchPoolData = async (
  poolId: string | undefined,
  address: string | undefined,
  directory: PoolDirectoryV1,
): Promise<PoolData | undefined> => {
  if (!poolId) return;

  const sdk = directory.sdk;
  const pool = await directory.pools(poolId, { from: address });

  const lens = new PoolLensV1(sdk, sdk.options?.poolLens ?? '');

  const summary = await lens.getPoolSummary(pool.comptroller);
  const assets = (await lens.getPoolAssetsWithData(pool.comptroller, {
    from: address,
    gas: 1e18,
  })) as USDPricedPoolAsset[];

  let totalLiquidityUSD = 0;

  let totalSupplyBalanceUSD = 0;
  let totalBorrowBalanceUSD = 0;

  let totalSuppliedUSD = 0;
  let totalBorrowedUSD = 0;

  const [ethPrice] = await getEthPrice();

  await Promise.all(
    assets.map(async (asset) => {
      asset.isPaused = await pool.comptroller.borrowGuardianPaused(
        asset.cToken.address,
      );
      asset.isSupplyPaused = await pool.comptroller.mintGuardianPaused(
        asset.cToken.address,
      );

      asset.usdPrice =
        (Number(asset.underlyingPrice) / 1e36) *
        ethPrice *
        10 ** Number(asset.underlyingDecimals);

      asset.supplyBalanceUSD =
        convertBNToNumber(asset.supplyBalance, asset.underlyingDecimals) *
        asset.usdPrice;

      asset.borrowBalanceUSD =
        convertBNToNumber(asset.borrowBalance, asset.underlyingDecimals) *
        asset.usdPrice;

      totalSupplyBalanceUSD += asset.supplyBalanceUSD;
      totalBorrowBalanceUSD += asset.borrowBalanceUSD;

      asset.totalSupplyUSD =
        convertBNToNumber(asset.totalSupply, asset.underlyingDecimals) *
        asset.usdPrice;
      asset.totalBorrowUSD =
        convertBNToNumber(asset.totalBorrow, asset.underlyingDecimals) *
        asset.usdPrice;

      totalSuppliedUSD += asset.totalSupplyUSD;
      totalBorrowedUSD += asset.totalBorrowUSD;

      asset.liquidityUSD =
        convertBNToNumber(asset.liquidity, asset.underlyingDecimals) *
        asset.usdPrice;

      totalLiquidityUSD += asset.liquidityUSD;
      return asset;
    }),
  );

  return {
    poolId,
    pool,
    summary,
    assets: assets
      .sort((a, b) => (b.liquidityUSD > a.liquidityUSD ? 1 : -1))
      .map((asset) => {
        return {
          ...asset,
          underlyingName: asset.underlyingName
            .replace('Uniswap', '')
            .replace('/', '-'),
        };
      }),

    totalLiquidityUSD,
    totalSuppliedUSD,
    totalBorrowedUSD,
    totalSupplyBalanceUSD,
    totalBorrowBalanceUSD,
  };
};
