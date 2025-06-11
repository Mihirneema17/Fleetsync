import { notFound } from 'next/navigation';
import { getVehicleById, getDocumentComplianceStatus } from '@/lib/data';
import type { Vehicle, VehicleDocument } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Car, CalendarDays, FileText, UploadCloud, Edit, Trash2, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { DATE_FORMAT } from '@/lib/constants';
// Placeholder for DocumentUploadModal
// import { DocumentUploadModal } from '@/components/document/document-upload-modal';

export default async function VehicleDetailPage({ params }: { params: { id: string } }) {
  const vehicle = await getVehicleById(params.id);

  if (!vehicle) {
    notFound();
  }

  const getStatusConfig = (status: VehicleDocument['status']) => {
    switch (status) {
      case 'Compliant':
        return { icon: CheckCircle2, color: 'text-green-600', badgeVariant: 'default' as const, bgColor: 'bg-green-50' };
      case 'ExpiringSoon':
        return { icon: Clock, color: 'text-yellow-600', badgeVariant: 'secondary' as const, bgColor: 'bg-yellow-50' };
      case 'Overdue':
        return { icon: AlertTriangle, color: 'text-red-600', badgeVariant: 'destructive' as const, bgColor: 'bg-red-50' };
      case 'Missing':
      default:
        return { icon: AlertTriangle, color: 'text-orange-500', badgeVariant: 'outline' as const, bgColor: 'bg-orange-50' };
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
            <Car className="h-10 w-10 text-primary" />
            <div>
                <h1 className="text-3xl font-bold font-headline">{vehicle.registrationNumber}</h1>
                <p className="text-muted-foreground">{vehicle.make} {vehicle.model} - {vehicle.type}</p>
            </div>
        </div>
        <div className="flex gap-2">
            <Link href={`/vehicles/${vehicle.id}/edit`}>
                <Button variant="outline"><Edit className="mr-2 h-4 w-4" /> Edit Vehicle</Button>
            </Link>
            {/* <DocumentUploadModal vehicleId={vehicle.id} triggerButton={<Button><UploadCloud className="mr-2 h-4 w-4" /> Upload Document</Button>} /> */}
            <Button><UploadCloud className="mr-2 h-4 w-4" /> Upload Document</Button> {/* Placeholder */}
        </div>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">Vehicle Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><span className="font-medium">Registration:</span> {vehicle.registrationNumber}</div>
          <div><span className="font-medium">Type:</span> {vehicle.type}</div>
          <div><span className="font-medium">Make:</span> {vehicle.make}</div>
          <div><span className="font-medium">Model:</span> {vehicle.model}</div>
          <div><span className="font-medium">Added On:</span> {format(parseISO(vehicle.createdAt), DATE_FORMAT)}</div>
          <div><span className="font-medium">Last Updated:</span> {format(parseISO(vehicle.updatedAt), DATE_FORMAT)}</div>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="font-headline">Compliance Documents</CardTitle>
          <CardDescription>Manage and track expiry dates for all essential documents.</CardDescription>
        </CardHeader>
        <CardContent>
          {vehicle.documents.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document Type</TableHead>
                  <TableHead>Expiry Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicle.documents.map((doc) => {
                  const status = getDocumentComplianceStatus(doc.expiryDate);
                  const config = getStatusConfig(status);
                  const StatusIcon = config.icon;
                  return (
                    <TableRow key={doc.id} className={cn(config.bgColor?.replace('bg-','hover:bg-opacity-80 hover:bg-'))}>
                      <TableCell className="font-medium">
                        <FileText className="inline mr-2 h-4 w-4 text-muted-foreground" />
                        {doc.type === 'Other' && doc.customTypeName ? doc.customTypeName : doc.type}
                      </TableCell>
                      <TableCell>
                        {doc.expiryDate ? format(parseISO(doc.expiryDate), DATE_FORMAT) : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={config.badgeVariant} className={cn(
                           config.status === 'ExpiringSoon' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : '',
                           config.status === 'Compliant' ? 'bg-green-100 text-green-800 border-green-300' : ''
                        )}>
                          <StatusIcon className={cn("mr-1 h-3 w-3", config.color)} />
                          {status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="mr-2">
                           {/* <DocumentUploadModal vehicleId={vehicle.id} documentType={doc.type} customTypeName={doc.customTypeName} initialDocument={doc} triggerButton={<><UploadCloud className="mr-1 h-4 w-4" /> Update</>} /> */}
                           <UploadCloud className="mr-1 h-4 w-4" /> Update {/* Placeholder */}
                        </Button>
                        {doc.documentUrl && (
                          <Button variant="link" size="sm" asChild>
                            <a href={doc.documentUrl} target="_blank" rel="noopener noreferrer">View</a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="mx-auto h-12 w-12 mb-4" />
              <p>No documents uploaded for this vehicle yet.</p>
            </div>
          )}
        </CardContent>
        <CardFooter>
            <Button variant="outline">
                <FileText className="mr-2 h-4 w-4" /> Add Custom Document
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
