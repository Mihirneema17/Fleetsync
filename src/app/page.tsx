
"use client";
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Car, FileWarning, ShieldAlert, Users, CheckCircle, ShieldCheck, ActivitySquare, Leaf, Paperclip, PieChart as PieChartIcon, AlertCircle, Loader2 } from 'lucide-react';
import { SummaryCard } from '@/components/dashboard/summary-card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { getSummaryStats, getVehicles, getAlerts, getDocumentComplianceStatus, getOverallVehicleCompliance, getLatestDocumentForType } from '@/lib/data';
import type { Vehicle, Alert as AlertType, SummaryStats, DocumentType, VehicleDocument, VehicleComplianceStatusBreakdown } from '@/lib/types';
import { VehicleCard } from '@/components/vehicle/vehicle-card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDistanceToNow, parseISO, differenceInDays, format } from 'date-fns';
import { EXPIRY_WARNING_DAYS, DATE_FORMAT, DOCUMENT_TYPES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip } from "recharts";


interface DocumentAlertItem {
  vehicleId: string;
  vehicleRegistration: string;
  documentId: string;
  documentType: DocumentType;
  customTypeName?: string;
  expiryDate: string;
  statusText: string;
  statusVariant: 'destructive' | 'secondary' | 'default' | 'outline';
  daysDiff: number;
}

const documentTypeIcons: Record<DocumentType | 'Generic', React.ElementType> = {
  Insurance: ShieldCheck,
  Fitness: ActivitySquare,
  PUC: Leaf,
  AITP: Paperclip,
  Other: FileWarning,
  Generic: FileWarning,
};

const chartConfig: ChartConfig = {
  compliant: { label: "Compliant", color: "hsl(var(--chart-2))" },
  expiringSoon: { label: "Expiring Soon", color: "hsl(var(--chart-4))" },
  overdue: { label: "Overdue", color: "hsl(var(--chart-1))" },
  missingInfo: { label: "Missing Info", color: "hsl(var(--chart-5))" },
};

export default function DashboardPage() {
  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [recentVehicles, setRecentVehicles] = useState<Vehicle[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<AlertType[]>([]);
  const [allVehicles, setAllVehicles] = useState<Vehicle[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      const [summary, vehiclesData, alertsData] = await Promise.all([
        getSummaryStats(),
        getVehicles(),
        getAlerts(true) // Fetch only unread alerts
      ]);
      setStats(summary);
      setAllVehicles(vehiclesData);
      setRecentVehicles(vehiclesData.slice(0, 4));
      setRecentAlerts(alertsData.slice(0,5)); // Show top 5 unread alerts
      setIsLoading(false);
    }
    fetchData();
  }, []);

  const processVehiclesForDocumentAlerts = useCallback((vehicles: Vehicle[], docTypeToFilter: DocumentType): DocumentAlertItem[] => {
    const items: DocumentAlertItem[] = [];
    const now = new Date();

    vehicles.forEach(vehicle => {
      const latestDoc = getLatestDocumentForType(vehicle, docTypeToFilter);

      if (latestDoc && latestDoc.expiryDate) {
        const expiry = parseISO(latestDoc.expiryDate);
        const daysDifference = differenceInDays(expiry, now);
        const complianceStatus = getDocumentComplianceStatus(latestDoc.expiryDate);

        if (complianceStatus === 'Overdue' || complianceStatus === 'ExpiringSoon') {
          let statusText = '';
          let statusVariant: DocumentAlertItem['statusVariant'] = 'default';

          if (complianceStatus === 'Overdue') {
            statusText = `Overdue by ${Math.abs(daysDifference)} day(s)`;
            statusVariant = 'destructive';
          } else if (complianceStatus === 'ExpiringSoon') {
            statusText = `Expires in ${daysDifference} day(s)`;
            statusVariant = 'secondary';
          }
          
          items.push({
            vehicleId: vehicle.id,
            vehicleRegistration: vehicle.registrationNumber,
            documentId: latestDoc.id,
            documentType: latestDoc.type,
            customTypeName: latestDoc.customTypeName,
            expiryDate: latestDoc.expiryDate,
            statusText,
            statusVariant,
            daysDiff: daysDifference,
          });
        }
      }
    });
    return items.sort((a, b) => a.daysDiff - b.daysDiff);
  }, []);
  
  const documentSections = useMemo(() => {
    return DOCUMENT_TYPES.filter(type => type !== 'Other').map(docType => ({
        title: `${docType} Status`,
        docType: docType,
        items: processVehiclesForDocumentAlerts(allVehicles, docType),
        icon: documentTypeIcons[docType] || documentTypeIcons.Generic,
    }));
  }, [allVehicles, processVehiclesForDocumentAlerts]);


  const chartData = stats?.vehicleComplianceBreakdown ? [
    { name: "Compliant", value: stats.vehicleComplianceBreakdown.compliant, fill: "var(--color-compliant)" },
    { name: "Expiring Soon", value: stats.vehicleComplianceBreakdown.expiringSoon, fill: "var(--color-expiringSoon)" },
    { name: "Overdue", value: stats.vehicleComplianceBreakdown.overdue, fill: "var(--color-overdue)" },
    { name: "Missing Info", value: stats.vehicleComplianceBreakdown.missingInfo, fill: "var(--color-missingInfo)" },
  ].filter(item => item.value > 0) : [];


  if (isLoading || !stats) {
    return (
      <div className="flex justify-center items-center h-screen">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }


  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Total Vehicles"
          value={stats.totalVehicles}
          icon={Car}
          iconClassName="text-primary"
        />
        <SummaryCard
          title="Compliant Vehicles"
          value={`${stats.vehicleComplianceBreakdown.compliant} / ${stats.totalVehicles}`}
          icon={CheckCircle}
          description={`${stats.totalVehicles > 0 ? ((stats.vehicleComplianceBreakdown.compliant/stats.totalVehicles)*100).toFixed(0) : 0}% fleet compliance`}
          iconClassName="text-green-500"
        />
        <SummaryCard
          title="Expiring Soon (Active Docs)"
          value={stats.expiringSoonDocuments}
          icon={FileWarning}
          description="Total active documents needing attention"
          iconClassName="text-yellow-500"
        />
        <SummaryCard
          title="Overdue (Active Docs)"
          value={stats.overdueDocuments}
          icon={ShieldAlert}
          description="Total active documents requiring immediate action"
          iconClassName="text-red-500"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
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
                {chartData.length > 0 && stats.vehicleComplianceBreakdown.total > 0 ? (
                    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[300px]">
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

        <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold font-headline">Vehicle Status Quick View</h2>
            <Link href="/vehicles">
                <Button variant="outline" size="sm">View All Vehicles</Button>
            </Link>
            </div>
            {recentVehicles.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
                {recentVehicles.map((vehicle) => (
                <VehicleCard key={vehicle.id} vehicle={vehicle} />
                ))}
            </div>
            ) : (
            <Card className="flex flex-col items-center justify-center py-12">
                <Car className="w-16 h-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold mb-2">No Vehicles Yet</h3>
                <p className="text-muted-foreground mb-4">Add your first vehicle to get started.</p>
                <Link href="/vehicles/add">
                <Button>Add Vehicle</Button>
                </Link>
            </Card>
            )}
        </div>
      </div>


      <div>
        <h2 className="text-xl font-semibold font-headline mb-4">Detailed Document Status - Action Required</h2>
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
          {documentSections.map(({ title, items, icon: Icon, docType }) => (
            <Card key={title} className="shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="font-headline text-lg flex items-center">
                  <Icon className="mr-2 h-5 w-5 text-primary" />
                  {title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {items.length > 0 ? (
                  <ScrollArea className={cn("max-h-[300px]", items.length > 5 ? "h-[300px]" : "")}>
                    <Table className="w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[35%]">Vehicle Reg.</TableHead>
                          <TableHead className="w-[45%]">Status</TableHead>
                          <TableHead className="text-right w-[20%]">Expires</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map(item => (
                          <TableRow key={item.documentId}>
                            <TableCell className="font-medium">
                              <Link href={`/vehicles/${item.vehicleId}?scrollToDoc=${item.documentId}`} className="hover:underline text-primary">
                                {item.vehicleRegistration}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={item.statusVariant}
                                className={cn(
                                  item.statusVariant === 'secondary' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : ''
                                )}
                              >
                                {item.statusText}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {format(parseISO(item.expiryDate), DATE_FORMAT)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">All {docType.toLowerCase()} documents are compliant.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>


      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
            {/* Placeholder for future content or keep vehicle quick view if it doesn't fit above */}
        </div>
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold font-headline">Recent Alerts</h2>
            {recentAlerts.length > 0 && <Link href="/alerts"><Button variant="outline" size="sm">View All</Button></Link>}
          </div>
          {recentAlerts.length > 0 ? (
            <ScrollArea className="h-[400px] rounded-md border p-2 bg-card">
              <div className="space-y-3 p-2">
              {recentAlerts.map((alert) => (
                <Alert key={alert.id} variant={alert.dueDate && new Date(alert.dueDate) < new Date() ? "destructive" : "default"} className="shadow-sm">
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle className="font-semibold text-sm">{alert.documentType === 'Other' && alert.customDocumentTypeName ? alert.customDocumentTypeName : alert.documentType} (Policy: {alert.policyNumber || 'N/A'}) - {alert.vehicleRegistration}</AlertTitle>
                  <AlertDescription className="text-xs">
                    {alert.message.replace(`(Policy: ${alert.policyNumber || 'N/A'}, Uploaded: ${format(parseISO(alert.createdAt), 'MMM dd, yyyy')})`, '')}
                    <div className="text-xs text-muted-foreground mt-1">
                      Due: {format(parseISO(alert.dueDate), 'MMM dd, yyyy')} - created {formatDistanceToNow(parseISO(alert.createdAt), { addSuffix: true })}
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
              </div>
            </ScrollArea>
          ) : (
             <Alert className="shadow-sm">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertTitle className="font-semibold">All Clear!</AlertTitle>
                <AlertDescription>
                  No active alerts at the moment.
                </AlertDescription>
              </Alert>
          )}
        </div>
      </div>

    </div>
  );
}

