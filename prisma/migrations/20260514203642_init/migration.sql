-- CreateEnum
CREATE TYPE "Role" AS ENUM ('executive', 'manager', 'employee');

-- CreateEnum
CREATE TYPE "project_health" AS ENUM ('healthy', 'at_risk', 'blocked');

-- CreateEnum
CREATE TYPE "project_risk" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "blocker_status" AS ENUM ('open', 'in_progress', 'resolved');

-- CreateEnum
CREATE TYPE "InsightSeverity" AS ENUM ('info', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'ai');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('update', 'alert', 'blocker', 'ai', 'resolved');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "avatar" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "manager_id" TEXT NOT NULL,
    "health" "project_health" NOT NULL DEFAULT 'healthy',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "risk" "project_risk" NOT NULL DEFAULT 'low',
    "blockers" INTEGER NOT NULL DEFAULT 0,
    "department" TEXT NOT NULL,
    "deadline" TIMESTAMP(3),
    "morale" INTEGER NOT NULL DEFAULT 70,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id","user_id")
);

-- CreateTable
CREATE TABLE "updates" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "signals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "extracted_metrics" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "update_id" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blockers" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "reported_by" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "Severity" NOT NULL DEFAULT 'medium',
    "status" "blocker_status" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "blockers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" TEXT NOT NULL,
    "project_id" TEXT,
    "severity" "InsightSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '🔵',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_feed" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "project_id" TEXT,
    "type" "ActivityType" NOT NULL DEFAULT 'update',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_feed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "morale_history" (
    "id" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "week_label" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "morale_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_progress_history" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "progress" INTEGER NOT NULL,
    "week_label" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_progress_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_department_idx" ON "users"("department");

-- CreateIndex
CREATE INDEX "projects_health_idx" ON "projects"("health");

-- CreateIndex
CREATE INDEX "projects_risk_idx" ON "projects"("risk");

-- CreateIndex
CREATE INDEX "projects_department_idx" ON "projects"("department");

-- CreateIndex
CREATE INDEX "projects_manager_id_idx" ON "projects"("manager_id");

-- CreateIndex
CREATE INDEX "updates_project_id_idx" ON "updates"("project_id");

-- CreateIndex
CREATE INDEX "updates_user_id_idx" ON "updates"("user_id");

-- CreateIndex
CREATE INDEX "updates_created_at_idx" ON "updates"("created_at" DESC);

-- CreateIndex
CREATE INDEX "messages_update_id_idx" ON "messages"("update_id");

-- CreateIndex
CREATE INDEX "blockers_project_id_idx" ON "blockers"("project_id");

-- CreateIndex
CREATE INDEX "blockers_status_idx" ON "blockers"("status");

-- CreateIndex
CREATE INDEX "blockers_severity_idx" ON "blockers"("severity");

-- CreateIndex
CREATE INDEX "ai_insights_project_id_idx" ON "ai_insights"("project_id");

-- CreateIndex
CREATE INDEX "ai_insights_severity_idx" ON "ai_insights"("severity");

-- CreateIndex
CREATE INDEX "activity_feed_project_id_idx" ON "activity_feed"("project_id");

-- CreateIndex
CREATE INDEX "activity_feed_user_id_idx" ON "activity_feed"("user_id");

-- CreateIndex
CREATE INDEX "activity_feed_created_at_idx" ON "activity_feed"("created_at" DESC);

-- CreateIndex
CREATE INDEX "morale_history_department_week_label_idx" ON "morale_history"("department", "week_label");

-- CreateIndex
CREATE INDEX "project_progress_history_project_id_week_label_idx" ON "project_progress_history"("project_id", "week_label");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "updates" ADD CONSTRAINT "updates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "updates" ADD CONSTRAINT "updates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_update_id_fkey" FOREIGN KEY ("update_id") REFERENCES "updates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blockers" ADD CONSTRAINT "blockers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blockers" ADD CONSTRAINT "blockers_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_insights" ADD CONSTRAINT "ai_insights_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_feed" ADD CONSTRAINT "activity_feed_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_feed" ADD CONSTRAINT "activity_feed_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_progress_history" ADD CONSTRAINT "project_progress_history_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
