"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { PAYLOADS } from "@/data/payloads";
import type { Payload, PayloadCategory, RiskLevel, LLMFamily } from "@/types";

interface PayloadFilters {
  search: string;
  category: PayloadCategory | "All";
  riskLevel: RiskLevel | "All";
  targetModel: LLMFamily | "All";
}

async function fetchPayloads(): Promise<Payload[]> {
  // In a real deployment this would fetch from an API
  return PAYLOADS;
}

export function usePayloads() {
  const [filters, setFilters] = useState<PayloadFilters>({
    search: "",
    category: "All",
    riskLevel: "All",
    targetModel: "All",
  });

  const { data: payloads = [], isLoading, error } = useQuery({
    queryKey: ["payloads"],
    queryFn: fetchPayloads,
    staleTime: 5 * 60 * 1000,
  });

  const filteredPayloads = useMemo(() => {
    return payloads.filter((payload) => {
      const matchesSearch =
        filters.search === "" ||
        payload.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        payload.description.toLowerCase().includes(filters.search.toLowerCase()) ||
        payload.tags.some((tag) =>
          tag.toLowerCase().includes(filters.search.toLowerCase())
        );

      const matchesCategory =
        filters.category === "All" || payload.category === filters.category;

      const matchesRisk =
        filters.riskLevel === "All" || payload.riskLevel === filters.riskLevel;

      const matchesModel =
        filters.targetModel === "All" ||
        payload.targetModels.includes(filters.targetModel as LLMFamily);

      return matchesSearch && matchesCategory && matchesRisk && matchesModel;
    });
  }, [payloads, filters]);

  return {
    payloads: filteredPayloads,
    allPayloads: payloads,
    isLoading,
    error,
    filters,
    setFilters,
  };
}
