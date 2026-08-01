"use client";

import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useSignTypedData } from "wagmi";
import type { Address, PublicClient } from "viem";
import {
  buildPermitTypedData,
  checkPermitCapability,
  splitSignature,
  type PermitCapability,
} from "./permit";
import type { SignedPermit } from "./permit";

/**
 * Quản lý luồng ERC-2612: kiểm tra token/ví có dùng permit được không, rồi lấy
 * chữ ký thay cho giao dịch approve.
 *
 * Vì sao tách khỏi `Swap.tsx`: điều kiện dùng permit là kết quả của 3 lời gọi
 * RPC (getCode của ví, probe domain, đọc nonce) và phải fallback êm sang approve
 * khi bất kỳ điều kiện nào không thoả — logic đó không nên nằm lẫn trong render.
 */

/** Thời hạn hiệu lực của chữ ký permit (phút). */
const PERMIT_TTL_MINUTES = 30;

export function usePermit({
  chainId,
  token,
  owner,
  spender,
  enabled,
}: {
  chainId: number;
  /** Token ERC-20 đang bán; undefined khi bán native. */
  token: Address | undefined;
  owner: Address | undefined;
  spender: Address | undefined;
  enabled: boolean;
}) {
  const publicClient = usePublicClient({ chainId });
  const { signTypedDataAsync } = useSignTypedData();
  const [signed, setSigned] = useState<SignedPermit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  const capability = useQuery<PermitCapability | null>({
    queryKey: ["permit-capability", chainId, token, owner, spender],
    enabled: enabled && !!publicClient && !!token && !!owner && !!spender,
    // Query này chỉ để BIẾT có ký được hay không (chọn nút Approve hay Permit).
    // Nonce dùng lúc ký được đọc lại trong `sign`, nên cache ở đây vô hại.
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () =>
      checkPermitCapability(
        publicClient as PublicClient,
        token!,
        owner!,
        spender!,
      ),
  });

  /** Có thể ký permit thay vì approve. */
  const available = !!capability.data;

  const sign = useCallback(
    async (value: bigint): Promise<SignedPermit | null> => {
      if (!publicClient || !token || !owner || !spender) return null;
      setError(null);
      setSigning(true);
      try {
        // Đọc lại capability ngay trước khi ký thay vì dùng kết quả cache: nếu
        // người dùng vừa permit ở tab khác thì nonce cũ làm chữ ký vô hiệu và
        // tx sẽ revert SAU KHI đã ký. Domain đã được cache trong permit.ts nên
        // lần gọi này chỉ tốn 2 RPC (getCode + nonces).
        const cap = await checkPermitCapability(
          publicClient as PublicClient,
          token,
          owner,
          spender,
        );
        if (!cap) throw new Error("Token này không hỗ trợ permit.");

        const deadline = BigInt(
          Math.floor(Date.now() / 1000) + PERMIT_TTL_MINUTES * 60,
        );
        const typedData = buildPermitTypedData({
          domain: cap.domain,
          owner,
          spender,
          value,
          nonce: cap.nonce,
          deadline,
        });
        const signature = await signTypedDataAsync(typedData);
        const { r, s, v } = splitSignature(signature);
        const result: SignedPermit = { token, value, deadline, r, s, v };
        setSigned(result);
        return result;
      } catch (e) {
        setError((e as Error).message);
        return null;
      } finally {
        setSigning(false);
      }
    },
    [owner, publicClient, signTypedDataAsync, spender, token],
  );

  const reset = useCallback(() => {
    setSigned(null);
    setError(null);
  }, []);

  return {
    available,
    checking: capability.isLoading,
    signed,
    signing,
    error,
    sign,
    reset,
  };
}
