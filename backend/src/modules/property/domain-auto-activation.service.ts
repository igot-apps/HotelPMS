import { prisma } from '../../shared/utils/prisma';
import { verifyDomainReadiness } from './render-domain.service';

let checking = false;

export async function activateReadyWebsiteDomains() {
  if (checking || !process.env.RENDER_API_KEY || !process.env.RENDER_FRONTEND_SERVICE_ID) return;
  checking = true;
  try {
    const domains = await prisma.propertyWebsiteDomain.findMany({
      where: { autoActivate: true, isActive: false },
      select: { domainId: true, hostname: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const domain of domains) {
      try {
        const result = await verifyDomainReadiness(domain.hostname);
        if (result.ready) {
          await prisma.propertyWebsiteDomain.updateMany({
            where: { domainId: domain.domainId, autoActivate: true, isActive: false },
            data: { isActive: true },
          });
        }
      } catch (error) {
        console.error(`Could not check website domain ${domain.hostname}; will retry.`, error);
      }
    }
  } finally {
    checking = false;
  }
}
