
"use client";

import React from 'react';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip } from "recharts";
import { AlertCircle, PieChart as PieChartIcon } from 'lucide-react'; // Renamed to avoid conflict with Recharts PieChart
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { VehicleComplianceStatusBreakdown } from '@/lib/types';

const chartConfigConst: ChartConfig = {
  compliant: { label: "Compliant", color: "hsl(var(--chart-2))" },
  expiringSoon: { label: "Expiring Soon", color: "hsl(var(--chart-4))" },
  overdue: { label: "Overdue", color: "hsl(var(--chart-1))" },
  missingInfo: { label: "Missing Info", color: "hsl(var(--chart-5))" },
};

interface CompliancePieChartProps {
  breakdown: VehicleComplianceStatusBreakdown | undefined;
}

export function CompliancePieChart({ breakdown }: CompliancePieChartProps) {
  const chartData = breakdown ? [
    { name: "Compliant", value: breakdown.compliant, fill: "var(--color-compliant)" },
    { name: "Expiring Soon", value: breakdown.expiringSoon, fill: "var(--color-expiringSoon)" },
    { name: "Overdue", value: breakdown.overdue, fill: "var(--color-overdue)" },
    { name: "Missing Info", value: breakdown.missingInfo, fill: "var(--color-missingInfo)" },
  ].filter(item => item.value > 0) : [];

  return (
    <Card className="md:col-span-1 shadow-md">
      <CardHeader>
        <CardTitle className="font-headline text-lg flex items-center">
          <PieChartIcon className="mr-2 h-5 w-5 text-primary" />
          Vehicle Compliance Overview
        </CardTitle>
        <CardDescription>
          At-a-glance status of your fleet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 && breakdown && breakdown.total > 0 ? (
          <ChartContainer config={chartConfigConst} className="mx-auto aspect-square max-h-[300px]">
            <PieChart>
              <RechartsTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                strokeWidth={2}
              >
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <ChartLegend content={<ChartLegendContent nameKey="name" />} />
            </PieChart>
          </ChartContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-[250px] text-muted-foreground">
            <AlertCircle className="w-12 h-12 mb-2" />
            <p>No vehicle data available for chart.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
