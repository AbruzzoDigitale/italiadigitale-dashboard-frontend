import { useCallback, useState } from "react";
import {
  previewContractAiWorkItemsApi,
  previewContractManualWorkItemsApi,
  type ContractAiGenerateWorkItemsPreviewPayload,
  type ContractAiGenerateWorkItemsResponse,
  type ContractManualGenerateWorkItemsPreviewPayload,
  type ContractManualGenerateWorkItemsResponse,
  type ContractAiWorkItemDraftUpsert,
} from "../api/contracts";

export type ContractTaskGenerationMode = "ai" | "manual";

export interface ContractAiPreviewDraft extends ContractAiWorkItemDraftUpsert {
  rationale: string | null;
  suggested_assignee_ids: number[];
  suggested_work_area_ids: number[];
  suggested_tag_ids: number[];
}

export interface ContractAiPreviewSession {
  contractId: number;
  companyId: number;
  clientId: number | null;
  generationMode: ContractTaskGenerationMode;
  generationJobId: string;
  generationSourceType: string;
  operationCode: string;
  llmProfile: {
    slug: string;
    provider: string;
    modelName: string;
  } | null;
  drafts: ContractAiPreviewDraft[];
  currentIndex: number;
  savedDraftIds: Set<string>;
}

interface UseContractAiWorkItemsPreviewResult {
  generatePreview: (
    contractId: number,
    payload: ContractAiGenerateWorkItemsPreviewPayload | ContractManualGenerateWorkItemsPreviewPayload,
    mode: ContractTaskGenerationMode
  ) => Promise<ContractAiPreviewSession>;
  isGenerating: boolean;
  error: string | null;
  lastResponse: ContractAiGenerateWorkItemsResponse | null;
  reset: () => void;
}

function generateJobId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString();
}

function mapGeneratedItemToEditableDraft(item: ContractAiGenerateWorkItemsResponse["generated_items"][number]): ContractAiPreviewDraft {
  return {
    draft_id: item.draft_id,
    title: item.title,
    description: item.description,
    ped_configuration_id: null,
    ped_configuration: null,
    work_date: null,
    estimated_hours: null,
    start_time: null,
    deadline_date: null,
    status: "planned",
    task_type: "standard",
    is_ped: item.is_ped,
    assignee_ids: [...item.suggested_assignee_ids],
    work_area_ids: [...item.suggested_work_area_ids],
    tag_ids: [...item.suggested_tag_ids],
    is_recurring: false,
    recurrence_type: null,
    recurrence_interval_days: null,
    recurrence_day_of_month: null,
    recurrence_until: null,
    generate_recurrences: false,
    generation_end_date: null,
    progress_percent: 0,
    is_completed: false,
    actual_hours_spent: null,
    affects_daily_load: true,
    load_weight_factor: 1,
    is_left_behind: false,
    left_behind_reason: null,
    left_behind_note: null,
    urgency_level: null,
    is_priority: false,
    contract_ids: [],
    time_slots: [],
    checklists: [],
    rationale: item.rationale,
    suggested_assignee_ids: [...item.suggested_assignee_ids],
    suggested_work_area_ids: [...item.suggested_work_area_ids],
    suggested_tag_ids: [...item.suggested_tag_ids],
  };
}

export function useContractAiWorkItemsPreview(): UseContractAiWorkItemsPreviewResult {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<ContractAiGenerateWorkItemsResponse | null>(null);

  const reset = useCallback(() => {
    setError(null);
    setLastResponse(null);
  }, []);

  const generatePreview = useCallback(async (
    contractId: number,
    payload: ContractAiGenerateWorkItemsPreviewPayload | ContractManualGenerateWorkItemsPreviewPayload,
    mode: ContractTaskGenerationMode
  ): Promise<ContractAiPreviewSession> => {
    setIsGenerating(true);
    setError(null);
    try {
      if (mode === "manual") {
        const response: ContractManualGenerateWorkItemsResponse = await previewContractManualWorkItemsApi(
          contractId,
          payload as ContractManualGenerateWorkItemsPreviewPayload
        );

        const session: ContractAiPreviewSession = {
          contractId: response.contract_id,
          companyId: response.company_id,
          clientId: response.client_id,
          generationMode: "manual",
          generationJobId: response.manual_generation_job_id,
          generationSourceType: "contract",
          operationCode: response.operation_code,
          llmProfile: null,
          drafts: response.generated_items.map(mapGeneratedItemToEditableDraft),
          currentIndex: 0,
          savedDraftIds: new Set<string>(),
        };
        return session;
      }

      const response: ContractAiGenerateWorkItemsResponse = await previewContractAiWorkItemsApi(
        contractId,
        payload as ContractAiGenerateWorkItemsPreviewPayload
      );
      setLastResponse(response);

      const session: ContractAiPreviewSession = {
        contractId: response.contract_id,
        companyId: response.company_id,
        clientId: response.client_id,
        generationMode: "ai",
        generationJobId: generateJobId(),
        generationSourceType: "contract",
        operationCode: response.operation_code,
        llmProfile: {
          slug: response.llm_profile_slug,
          provider: response.llm_provider,
          modelName: response.llm_model_name,
        },
        drafts: response.generated_items.map(mapGeneratedItemToEditableDraft),
        currentIndex: 0,
        savedDraftIds: new Set<string>(),
      };
      return session;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore generazione preview AI";
      setError(message);
      throw err;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  return {
    generatePreview,
    isGenerating,
    error,
    lastResponse,
    reset,
  };
}
