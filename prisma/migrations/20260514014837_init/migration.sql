-- CreateEnum
CREATE TYPE "Role" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('deposit', 'withdrawal', 'stake', 'winning', 'refund', 'admin_adjustment');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'completed', 'rejected');

-- CreateEnum
CREATE TYPE "RoomStatus" AS ENUM ('waiting', 'ready_up', 'active', 'tender', 'resolved');

-- CreateEnum
CREATE TYPE "TenderTrigger" AS ENUM ('checkup', 'market_empty');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "wallet_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "role" "Role" NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'pending',
    "reference" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "invite_code" VARCHAR(10) NOT NULL,
    "creator_id" TEXT NOT NULL,
    "max_players" INTEGER NOT NULL,
    "stake_amount" DECIMAL(12,2) NOT NULL DEFAULT 200,
    "status" "RoomStatus" NOT NULL DEFAULT 'waiting',
    "pot" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "house_fee_percent" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "draw_pile" JSONB NOT NULL DEFAULT '[]',
    "discard_pile" JSONB NOT NULL DEFAULT '[]',
    "current_player_index" INTEGER NOT NULL DEFAULT 0,
    "extra_turn_pending" BOOLEAN NOT NULL DEFAULT false,
    "skip_next_player" BOOLEAN NOT NULL DEFAULT false,
    "turn_timer_expires" TIMESTAMP(3),
    "tender_trigger" "TenderTrigger",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_players" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "hand" JSONB NOT NULL DEFAULT '[]',
    "is_ready" BOOLEAN NOT NULL DEFAULT false,
    "last_card_shown" BOOLEAN NOT NULL DEFAULT false,
    "stake_locked" DECIMAL(12,2) NOT NULL DEFAULT 200,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_submissions" (
    "id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "card" JSONB NOT NULL,
    "rank" INTEGER,

    CONSTRAINT "tender_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prize_splits" (
    "id" TEXT NOT NULL,
    "num_participants" INTEGER NOT NULL,
    "split_json" JSONB NOT NULL,

    CONSTRAINT "prize_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_invite_code_key" ON "rooms"("invite_code");

-- CreateIndex
CREATE UNIQUE INDEX "room_players_room_id_user_id_key" ON "room_players"("room_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "tender_submissions_room_id_user_id_key" ON "tender_submissions"("room_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "prize_splits_num_participants_key" ON "prize_splits"("num_participants");

-- AddForeignKey
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_submissions" ADD CONSTRAINT "tender_submissions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_submissions" ADD CONSTRAINT "tender_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
