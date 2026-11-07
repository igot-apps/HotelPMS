CREATE TABLE "property_website_domains" (
    "domainId" SERIAL NOT NULL,
    "hostname" VARCHAR(253) NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "property_website_domains_pkey" PRIMARY KEY ("domainId")
);

CREATE UNIQUE INDEX "property_website_domains_hostname_key" ON "property_website_domains"("hostname");
CREATE INDEX "property_website_domains_propertyId_idx" ON "property_website_domains"("propertyId");
ALTER TABLE "property_website_domains" ADD CONSTRAINT "property_website_domains_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("propertyId") ON DELETE CASCADE ON UPDATE CASCADE;
