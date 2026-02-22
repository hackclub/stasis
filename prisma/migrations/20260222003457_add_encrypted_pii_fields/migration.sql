-- AlterTable
ALTER TABLE "user" ADD COLUMN     "encryptedAddressCity" TEXT,
ADD COLUMN     "encryptedAddressCountry" TEXT,
ADD COLUMN     "encryptedAddressState" TEXT,
ADD COLUMN     "encryptedAddressStreet" TEXT,
ADD COLUMN     "encryptedAddressZip" TEXT,
ADD COLUMN     "encryptedBirthday" TEXT;
