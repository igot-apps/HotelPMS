import 'dotenv/config';
import { prisma } from '../src/shared/utils/prisma';
import { applySimulatedReturnInTransaction } from '../src/modules/reservation/refund-simulation.service';
async function main() {
  if (!['localhost','127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error('This conversion script is restricted to the local test database.');
  const requests=await prisma.correctionRequest.findMany({where:{action:'refund',status:'Simulated',refund:{is:null}},orderBy:{requestId:'asc'}});
  let applied=0,skipped=0;
  for(const initial of requests) {
    const input:any=initial.input;
    if(input.mode!=='SimulatedMoMo'||input.simulation?.moneySent!==false||!initial.reviewedBy){skipped++;continue;}
    try {
      await prisma.$transaction(async tx=>{
        await tx.$queryRaw`SELECT "reservationId" FROM reservations WHERE "reservationId" = ${initial.reservationId} AND "propertyId" = ${initial.propertyId} FOR UPDATE`;
        const request=await tx.correctionRequest.findUniqueOrThrow({where:{requestId:initial.requestId}});
        const current:any=request.input;
        const simulation={...current.simulation,status:'Sent',balancesApplied:true};
        await applySimulatedReturnInTransaction(tx,{userId:initial.reviewedBy!,propertyId:initial.propertyId},request,simulation);
        await tx.correctionRequest.update({where:{requestId:initial.requestId},data:{input:{...current,simulation}}});
        await tx.auditLog.create({data:{userId:initial.reviewedBy,entityType:'Reservation',action:'SimulatedRefundSettled',newData:{reservationId:initial.reservationId,requestId:initial.requestId,amount:current.amount,simulationOnly:true,moneySent:false,reason:'Applied the approved simulation to the booking test balance.'}}});
      },{isolationLevel:'Serializable',timeout:15000});
      applied++;
    } catch(e:any) { skipped++; console.log(`Simulation request ${initial.requestId} left for review: ${e.message.split('\n')[0]}`); }
  }
  console.log(JSON.stringify({applied,skipped}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
