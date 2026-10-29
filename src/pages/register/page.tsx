import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ImageUpload, {
  MAX_IMAGE_SIZE,
  ALLOWED_IMAGE_TYPES,
} from "./components/ImageUpload";
import AiGenerateSection from "./components/AiGenerateSection";
import AiCandidateForm from "./components/AiCandidateForm";
import { useAiProductGeneration } from "./hooks/useAiProductGeneration";
import FormField, { inputClass } from "./components/FormField";
import FormSection from "./components/FormSection";
import SneakerFields, { type SneakerValues } from "./components/SneakerFields";
import JewelryFields, { type JewelryValues } from "./components/JewelryFields";
import PokemonCardFields, {
  type PokemonCardValues,
} from "./components/PokemonCardFields";
import { GOOGLE_SHEETS_WEBHOOK_URL } from "@/config/googleSheets";
import PublishSquareOptions from "./components/PublishSquareOptions";
import RegisterProgress from "./components/RegisterProgress";
import SaveStatusMessage from "@/components/base/SaveStatusMessage";
import {
  runSquareProductionSync,
  type SquareProductionStep,
} from "./lib/squareProduction";
import {
  AI_ANALYSIS_IMAGE_COUNT,
  buildConfirmedData,
  confirmAiProductDraft,
  createConfirmationAttemptId,
  formatAiError,
  resolveConditionLabel,
  validatePositiveSafeInteger,
} from "./lib/aiProduct";
import {
  categories,
  conditions,
  sneakerBrands,
  jewelryBrands,
  otherBrands,
  pokemonBrands,
  apparelBrands,
  fashionGoodsBrands,
  type CategoryId,
} from "@/mocks/productForm";

interface FormErrors {
  [key: string]: string;
}

interface Completion {
  type: "success" | "partial" | "error";
  title: string;
  message: string;
  checkoutUrl?: string;
  paymentLinkId?: string;
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file"));
        return;
      }
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

const initialSneaker: SneakerValues = {
  sku: "",
  size: "",
  color: "",
  box: "",
  year: "",
};

const initialJewelry: JewelryValues = {
  type: "",
  material: "",
  carat: "",
  shape: "",
  color: "",
  clarity: "",
  cut: "",
  stone: "",
  size: "",
  weight: "",
  certPresence: "",
  certNumber: "",
};

const initialPokemonCard: PokemonCardValues = {
  card_name: "",
  set_name: "",
  card_number: "",
  rarity: "",
  language: "Japanese",
  grading_status: "ungraded",
  grader: "",
  grade: "",
  certification_number: "",
  card_condition: "",
};

export default function RegisterPage() {
  const [images, setImages] = useState<File[]>([]);
  const [category, setCategory] = useState<CategoryId | "">("");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [description, setDescription] = useState("");
  const [condition, setCondition] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [memo, setMemo] = useState("");

  const [sneaker, setSneaker] = useState<SneakerValues>(initialSneaker);
  const [sneakerAccessories, setSneakerAccessories] = useState<string[]>([]);
  const [jewelry, setJewelry] = useState<JewelryValues>(initialJewelry);
  const [pokemonCard, setPokemonCard] = useState<PokemonCardValues>(
    initialPokemonCard
  );

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [productId, setProductId] = useState("");

  // 公開・Square連携オプション（MVP: 通常運用はデフォルトON）
  const [publishOn, setPublishOn] = useState(true);
  const [squareOn, setSquareOn] = useState(true);

  // 登録〜Square連携の進捗表示
  const [progressSteps, setProgressSteps] = useState<string[]>([]);
  const [progressIndex, setProgressIndex] = useState(-1);

  // 完了（成功 / 一部失敗 / 失敗）モーダル
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [checkoutCopyFeedback, setCheckoutCopyFeedback] = useState("");

  // AI商品情報生成（① 単品生成）
  const ai = useAiProductGeneration(images);
  const [isApplyConfirmOpen, setIsApplyConfirmOpen] = useState(false);
  // AI候補の確定保存（confirm_ai_product_draft）
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");
  // 同じ内容の再送（通信失敗時のリトライ）では同じ confirmation_attempt_id を再利用する
  const confirmAttemptRef = useRef<{
    signature: string;
    attemptId: string;
  } | null>(null);

  // 価格サジェストの手入力保護。
  // スタッフが価格欄を編集したら true にし、以後は生成・再生成でも自動入力で上書きしない。
  const priceTouchedRef = useRef(false);
  // 直前にAI概算で自動入力した値（これと同じ値なら再生成時に最新の概算へ更新してよい）
  const priceAutoValueRef = useRef<string | null>(null);

  // 価格サジェスト（AI概算）の自動反映。
  // - 未入力なら候補価格を自動入力する。
  // - スタッフが入力・修正済みの価格は上書きしない。
  // - candidate.price が null のときは何もしない（他の候補表示・編集・下書き保持を止めない）。
  useEffect(() => {
    const c = ai.candidate;
    if (!c || c.price == null) return;
    if (priceTouchedRef.current) return;
    const current = sellPrice.trim();
    if (current === "" || current === priceAutoValueRef.current) {
      const next = String(c.price);
      priceAutoValueRef.current = next;
      if (next !== sellPrice) setSellPrice(next);
    }
  }, [ai.candidate, sellPrice]);

  // 既に手入力があるか（AI候補の反映前に上書き確認するため）
  const hasExistingInput = Boolean(
    name.trim() ||
      description.trim() ||
      condition ||
      brand ||
      category ||
      sneaker.sku ||
      sneaker.size
  );

  const applyCandidate = () => {
    const c = ai.candidate;
    if (!c) return;

    if (c.title_ja.trim()) setName(c.title_ja.trim());
    if (c.description_ja.trim()) setDescription(c.description_ja.trim());

    const condId =
      conditions.find((x) => x.id === c.condition)?.id ??
      conditions.find((x) => x.label === c.condition)?.id;
    if (condId) setCondition(condId);

    const catId =
      categories.find((x) => x.id === c.category)?.id ??
      categories.find((x) => x.label === c.category)?.id;
    if (catId) setCategory(catId);

    if (c.brand.trim()) setBrand(c.brand.trim());

    // 価格サジェスト：未入力のときだけAI概算を反映する（手入力済みは上書きしない）。
    if (c.price != null && !priceTouchedRef.current && !sellPrice.trim()) {
      const next = String(c.price);
      priceAutoValueRef.current = next;
      setSellPrice(next);
    }

    if (c.sku.trim() || c.size.trim()) {
      setSneaker((prev) => ({
        ...prev,
        sku: c.sku.trim() || prev.sku,
        size: c.size.trim() || prev.size,
      }));
    }

    setIsApplyConfirmOpen(false);
  };

  const handleApplyCandidate = () => {
    if (!ai.candidate) return;
    if (hasExistingInput) {
      setIsApplyConfirmOpen(true);
      return;
    }
    applyCandidate();
  };

  // 販売予定価格の変更（下部フォームとAIドラフト確認カードで共通）。
  // スタッフの手入力・修正を記録し、以後はAI概算の自動入力で上書きしない。
  const handleSellPriceChange = (value: string) => {
    priceTouchedRef.current = true;
    setSellPrice(value.replace(/[^0-9]/g, ""));
  };

  // AI候補を確定保存する（confirm_ai_product_draft）。
  // 既存の仮draftを確定するだけで、新規商品は作成しない。
  const handleConfirmAiDraft = async () => {
    if (isConfirming) return;
    const c = ai.candidate;
    if (!c) {
      setConfirmError("確定保存できるAI候補がありません。");
      return;
    }
    if (!ai.draftId) {
      setConfirmError(
        "draft_id を取得できていません。GASの generate_ai_product_draft 応答を確認してください。"
      );
      return;
    }

    // confirm_ai_product_draft は「候補を確認して下書き保存する」処理として扱い、公開は行わない。
    // そのためスニーカーのサイズ未入力でも送信を止めず、空文字のまま confirmed_data に含める。

    // 価格は事前検証する。小数の丸めや不正値の null 送信はせず、確定前に入力エラーを出す。
    const priceCheck = validatePositiveSafeInteger(sellPrice);
    if (!priceCheck.ok) {
      setConfirmError(priceCheck.error);
      return;
    }

    // 状態は日本語6種類のいずれかで確定する（「S」などのランクはそのまま送らない）。
    if (!resolveConditionLabel(c.condition)) {
      setConfirmError("商品の状態（6種類）を選択してください。");
      return;
    }

    setIsConfirming(true);
    setConfirmError("");
    setCompletion(null);
    try {
      const isPokemon =
        category === "pokemon_card" ||
        (!category && c.category === "pokemon_card");
      const confirmedData = buildConfirmedData(
        c,
        priceCheck.value,
        isPokemon ? pokemonCard : null
      );

      // 同じ内容の再送では同じ confirmation_attempt_id を使う（通信失敗のたびに新UUIDを発行しない）。
      const signature = JSON.stringify({
        productId: ai.draftProductId,
        draftId: ai.draftId,
        draftVersion: ai.draftVersion,
        confirmedData,
      });
      const attemptId =
        confirmAttemptRef.current?.signature === signature
          ? confirmAttemptRef.current.attemptId
          : createConfirmationAttemptId();
      confirmAttemptRef.current = { signature, attemptId };

      const result = await confirmAiProductDraft({
        productId: ai.draftProductId,
        draftId: ai.draftId,
        draftVersion: ai.draftVersion,
        confirmationAttemptId: attemptId,
        confirmedData,
      });
      const confirmedId = result.product_id || ai.draftProductId;
      setProductId(confirmedId);
      setCompletion({
        type: "success",
        title: "AI候補を確定保存しました",
        message:
          "AI生成した内容を下書きとして確定保存しました。同じ商品として更新されており、新しい商品は作成していません。サイズなど後から追記する場合は、このまま編集して「この内容で確定保存」をもう一度押すと同じ商品に再確定できます。",
      });
      // 確定後も候補と draft 識別子（product_id / draft_id / draft_version）は保持する。
      // → 同じ商品にサイズを追記して再確定しても、商品や画像を作り直さない。
      // 再確定時の confirmation_attempt_id は「内容が変わったか」で判定する（下の署名ロジック）。
      // 変更がなければ同じ attempt id を使い、変更した内容にだけ新しい attempt id を発行する。
      // priceTouchedRef / priceAutoValueRef もここでは触らない（価格など他の入力値を保持）。
      // これらは「別の商品を登録」時の resetForm でのみ初期化する。
    } catch (err) {
      // 中継・GASの安全な error_code と message を保持してそのまま表示する
      // （汎用の「もう一度お試しください」で隠さない）。
      setConfirmError(
        formatAiError(err, "AI候補の確定保存に失敗しました。")
      );
    } finally {
      setIsConfirming(false);
    }
  };

  const brandOptions = useMemo(() => {
    let base: string[] = [];
    if (category === "sneaker") base = sneakerBrands;
    else if (category === "jewelry") base = jewelryBrands;
    else if (category === "pokemon_card") base = pokemonBrands;
    else if (category === "apparel") base = apparelBrands;
    else if (category === "fashion_goods") base = fashionGoodsBrands;
    else if (category === "other") base = otherBrands;
    // AI候補などで一覧に無いブランドが入った場合も表示できるようにする
    if (brand && !base.includes(brand)) return [...base, brand];
    return base;
  }, [category, brand]);

  const updateSneaker = (patch: Partial<SneakerValues>) => {
    setSneaker((prev) => ({ ...prev, ...patch }));
    if (patch.size) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.sneakerSize;
        return next;
      });
    }
  };

  const updateJewelry = (patch: Partial<JewelryValues>) => {
    setJewelry((prev) => ({ ...prev, ...patch }));
    if (patch.type || patch.material) {
      setErrors((prev) => {
        const next = { ...prev };
        if (patch.type) delete next.jewelryType;
        if (patch.material) delete next.jewelryMaterial;
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const next: FormErrors = {};

    if (images.length === 0) {
      next.images = "商品画像を1枚以上追加してください";
    } else {
      const hasInvalidType = images.some(
        (f) => !ALLOWED_IMAGE_TYPES.includes(f.type)
      );
      const hasOversize = images.some((f) => f.size > MAX_IMAGE_SIZE);
      if (hasInvalidType) {
        next.images =
          "対応していない画像形式が含まれています（JPG / JPEG / PNG / WEBP のみ）";
      } else if (hasOversize) {
        next.images = "1枚あたり5MBを超える画像は登録できません";
      }
    }
    // カテゴリー・ブランド・商品名・商品の状態は任意項目（未入力でも登録できる）

    // サイズは公開前に必須。下書き保存では未入力を許可する。
    if (category === "sneaker" && publishOn && !sneaker.size) {
      next.sneakerSize = "公開前にサイズを入力してください";
    }
    if (category === "jewelry" && !jewelry.type) {
      next.jewelryType = "種類を選択してください";
    }
    if (category === "jewelry" && !jewelry.material) {
      next.jewelryMaterial = "素材を選択してください";
    }
    if (category === "pokemon_card") {
      if (!pokemonCard.card_name.trim()) {
        next.pokemonCardName = "カード名を入力してください";
      }
      if (!pokemonCard.language) {
        next.pokemonCardLanguage = "言語を選択してください";
      }
      if (pokemonCard.grading_status === "graded") {
        if (!pokemonCard.grader) {
          next.pokemonCardGrader = "鑑定会社を選択してください";
        }
        if (!pokemonCard.grade.trim()) {
          next.pokemonCardGrade = "グレードを入力してください";
        }
      } else if (pokemonCard.grading_status === "ungraded") {
        if (!pokemonCard.card_condition) {
          next.pokemonCardCondition = "カード状態を選択してください";
        }
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  // セクション単位のエラー件数（既存の検証結果 errors を数えるだけ。検証条件は変更しない）
  const sectionErrors = useMemo(() => {
    const count = (keys: string[]) =>
      keys.reduce((total, key) => (errors[key] ? total + 1 : total), 0);
    return {
      images: count(["images"]),
      basic: count(["category", "brand", "name", "condition"]),
      sneaker: count(["sneakerSize"]),
      jewelry: count(["jewelryType", "jewelryMaterial"]),
      pokemon: count([
        "pokemonCardName",
        "pokemonCardLanguage",
        "pokemonCardGrader",
        "pokemonCardGrade",
        "pokemonCardCondition",
      ]),
    };
  }, [errors]);

  const buildPayload = () => {
    const conditionLabel =
      conditions.find((c) => c.id === condition)?.label ?? condition;

    const payload: Record<string, unknown> = {
      category: category || null,
      brand: brand || null,
      product_name: name.trim() || null,
      condition: conditionLabel || null,
      purchase_price: purchasePrice || null,
      planned_sale_price: sellPrice || null,
      storage_location: storageLocation || null,
      description: description || null,
      notes: memo || null,
      // 公開するチェックに応じて公開状態を設定（既定は published）
      publish_status: publishOn ? "published" : "draft",
      // スニーカー固有（該当しない場合は null）
      sneaker_sku: null,
      sneaker_size: null,
      sneaker_colorway: null,
      sneaker_box: null,
      sneaker_accessories: null,
      sneaker_release_year: null,
      // ジュエリー固有（該当しない場合は null）
      jewelry_type: null,
      jewelry_material: null,
      carat: null,
      shape: null,
      color_grade: null,
      clarity: null,
      cut: null,
      main_stone: null,
      jewelry_size: null,
      weight_g: null,
      certificate_available: null,
      certificate_number: null,
    };

    if (category === "sneaker") {
      payload.sneaker_sku = sneaker.sku || null;
      payload.sneaker_size = sneaker.size || null;
      payload.sneaker_colorway = sneaker.color || null;
      payload.sneaker_box = sneaker.box || null;
      payload.sneaker_accessories =
        sneakerAccessories.length > 0 ? sneakerAccessories.join(", ") : null;
      payload.sneaker_release_year = sneaker.year || null;
    }

    if (category === "jewelry") {
      payload.jewelry_type = jewelry.type || null;
      payload.jewelry_material = jewelry.material || null;
      payload.carat = jewelry.carat || null;
      payload.shape = jewelry.shape || null;
      payload.color_grade = jewelry.color || null;
      payload.clarity = jewelry.clarity || null;
      payload.cut = jewelry.cut || null;
      payload.main_stone = jewelry.stone || null;
      payload.jewelry_size = jewelry.size || null;
      payload.weight_g = jewelry.weight || null;
      payload.certificate_available = jewelry.certPresence || null;
      payload.certificate_number = jewelry.certNumber || null;
    }

    if (category === "pokemon_card") {
      const isGraded = pokemonCard.grading_status === "graded";
      payload.pokemon_card = {
        card_name: pokemonCard.card_name.trim(),
        set_name: pokemonCard.set_name.trim(),
        card_number: pokemonCard.card_number.trim(),
        rarity: pokemonCard.rarity,
        language: pokemonCard.language,
        grading_status: pokemonCard.grading_status,
        grader: isGraded ? pokemonCard.grader : "",
        grade: isGraded ? pokemonCard.grade : "",
        certification_number: isGraded ? pokemonCard.certification_number : "",
        card_condition: isGraded ? "" : pokemonCard.card_condition,
      };
    }

    return payload;
  };

  const handlePublishChange = (checked: boolean) => {
    setPublishOn(checked);
    // 公開OFF時はSquare連携を強制OFF（下書きを本番へ出さない）
    if (!checked) setSquareOn(false);
  };

  const handleSquareChange = (checked: boolean) => {
    if (!publishOn) return;
    setSquareOn(checked);
  };

  const handleCopyCheckoutUrl = async (url: string) => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCheckoutCopyFeedback("コピーしました");
    } catch {
      setCheckoutCopyFeedback("コピーに失敗しました");
    }
    window.setTimeout(() => setCheckoutCopyFeedback(""), 2000);
  };

  const handleSubmit = async () => {
    // 既存の送信中状態をそのまま二重送信の防止に使う（押下連打・再発火の抑止）。
    if (isSubmitting) return;

    // AI候補がある場合は確定保存（confirm_ai_product_draft）へ回す。
    // 候補が無い場合は下の通常保存へ進むが、仮draftの product_id があれば
    // 新規登録POSTではなく update_product で既存商品を更新する（二重作成防止）。
    if (ai.draftProductId && ai.candidate) {
      await handleConfirmAiDraft();
      return;
    }

    if (!validate()) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const willPublish = publishOn;
    const willSyncSquare = publishOn && squareOn;

    setIsSubmitting(true);
    setSubmitError("");
    setProductId("");
    setCompletion(null);

    // 進捗ステップを組み立てる
    const steps = ["商品を登録しています..."];
    if (willSyncSquare) {
      steps.push(
        "Squareへ商品を登録しています...",
        "画像を同期しています...",
        "在庫を同期しています...",
        "決済リンクを生成しています..."
      );
    }
    setProgressSteps(steps);
    setProgressIndex(0);

    try {
      const payload = buildPayload();

      // 仮draftが既にある場合は同じ product_id を再利用し、新規登録POSTを送らない。
      const existingDraftId = ai.draftProductId;
      let response: Response;

      if (existingDraftId) {
        // 画像が変わっていれば既存の画像更新APIで同期（変わっていなければ何もしない）
        await ai.syncDraftImages(existingDraftId);
        response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            ...payload,
            action: "update_product",
            product_id: existingDraftId,
          }),
        });
      } else {
        const imagesPayload = await Promise.all(
          images.map(async (file) => ({
            file_name: file.name,
            mime_type: file.type,
            base64: await fileToBase64(file),
          }))
        );
        response = await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ ...payload, images: imagesPayload }),
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data || data.success !== true) {
        throw new Error("Invalid response");
      }

      const newProductId = data.product_id ?? existingDraftId ?? "";
      setProductId(newProductId);

      // Square連携なし → BIS登録のみで完了
      if (!willSyncSquare) {
        setCompletion({
          type: "success",
          title: willPublish ? "商品を公開しました" : "商品を下書きとして登録しました",
          message: willPublish
            ? "商品を公開状態で登録しました。Square連携は行っていません。"
            : "商品を下書き（非公開）として登録しました。Square連携は行っていません。",
        });
        return;
      }

      // Square Production 連携（商品登録の後続処理。途中失敗でもBIS商品は残す）
      const stepIndexMap: Record<SquareProductionStep, number> = {
        idle: 0,
        product: 1,
        image: 2,
        inventory: 3,
        paymentLink: 4,
      };
      const result = await runSquareProductionSync(newProductId, (step) => {
        setProgressIndex(stepIndexMap[step]);
      });

      if (result.status === "success") {
        setCompletion({
          type: "success",
          title: "商品を登録・公開しました",
          message: "Square本番連携まで完了し、購入できる状態になりました。",
          checkoutUrl: result.checkoutUrl,
          paymentLinkId: result.paymentLinkId,
        });
      } else if (result.status === "partial") {
        setCompletion({
          type: "partial",
          title: "商品登録は完了しました",
          message: result.message,
        });
      } else {
        setCompletion({
          type: "error",
          title: "商品登録は完了しました",
          message: result.message,
        });
      }
    } catch {
      setSubmitError("商品の保存に失敗しました。もう一度お試しください。");
    } finally {
      setIsSubmitting(false);
      setProgressSteps([]);
      setProgressIndex(-1);
    }
  };

  const resetForm = () => {
    setImages([]);
    setCategory("");
    setName("");
    setBrand("");
    setDescription("");
    setCondition("");
    setPurchasePrice("");
    setSellPrice("");
    setStorageLocation("");
    setMemo("");
    setSneaker(initialSneaker);
    setSneakerAccessories([]);
    setJewelry(initialJewelry);
    setPokemonCard(initialPokemonCard);
    setErrors({});
    setSubmitError("");
    setProductId("");
    setPublishOn(true);
    setSquareOn(true);
    setProgressSteps([]);
    setProgressIndex(-1);
    setCompletion(null);
    setCheckoutCopyFeedback("");
    // AI生成・確定保存まわりも初期化
    ai.reset();
    setIsConfirming(false);
    setConfirmError("");
    confirmAttemptRef.current = null;
    priceTouchedRef.current = false;
    priceAutoValueRef.current = null;
  };

  return (
    <div className="admin-font products-theme min-h-screen bg-background-50">
      <header className="border-b border-background-200 bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3 md:px-6">
          <Link
            to="/products"
            className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-foreground-600 transition-colors hover:text-primary-600"
          >
            <i className="ri-arrow-left-line w-4 h-4 flex items-center justify-center"></i>
            商品一覧
          </Link>
          <span className="text-sm font-semibold text-foreground-950">商品登録</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-4 md:px-6">
        {/* 商品画像 */}
        <FormSection
          title="商品画像"
          errorCount={sectionErrors.images}
          className="py-4"
        >
          <ImageUpload
            files={images}
            onChange={setImages}
            error={errors.images}
            analysisCount={AI_ANALYSIS_IMAGE_COUNT}
          />

          {/* 画像登録欄のすぐ下：AIで商品情報を生成（①） */}
          <div className="mt-4 flex flex-col gap-4">
            <AiGenerateSection
              imageCount={images.length}
              phase={ai.phase}
              errorMessage={ai.errorMessage}
              disabled={isSubmitting}
              draftCreated={Boolean(ai.draftProductId)}
              onGenerate={ai.generate}
            />

            {ai.candidate && (
              <AiCandidateForm
                candidate={ai.candidate}
                onChange={ai.updateCandidate}
                onApply={handleApplyCandidate}
                onDiscard={ai.discardCandidate}
                onConfirm={handleConfirmAiDraft}
                priceInput={sellPrice}
                onPriceChange={handleSellPriceChange}
                confirming={isConfirming}
                confirmError={confirmError}
                confirmDisabled={isSubmitting}
              />
            )}

            <p className="flex flex-wrap items-center gap-1 text-[11px] text-foreground-400">
              <i className="ri-information-line w-4 h-4 flex items-center justify-center"></i>
              商品情報を入力せず画像だけで取り込む場合は
              <Link
                to="/import"
                className="font-medium text-primary-600 hover:underline"
              >
                画像だけ取込
              </Link>
              へ。
            </p>
          </div>
        </FormSection>

        <div className="border-t border-background-200"></div>

        {/* 商品の詳細 */}
        <FormSection
          title="商品の詳細"
          errorCount={sectionErrors.basic}
          className="py-4"
        >
          <div className="flex flex-col gap-4">
            <FormField label="カテゴリー" error={errors.category}>
              <select
                className={inputClass}
                value={category}
                onChange={(e) => {
                  const val = e.target.value as CategoryId | "";
                  setCategory(val);
                  setBrand("");
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.category;
                    return next;
                  });
                }}
              >
                <option value="">選択してください</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="ブランド" error={errors.brand}>
              <select
                className={inputClass}
                value={brand}
                disabled={!category}
                onChange={(e) => setBrand(e.target.value)}
              >
                <option value="">
                  {category ? "選択してください" : "先にカテゴリを選択してください"}
                </option>
                {brandOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="商品名" error={errors.name}>
              <input
                className={inputClass}
                type="text"
                placeholder="例：NIKE AIR FORCE 1 '07 ホワイト"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FormField>

            <FormField label="商品の状態" error={errors.condition}>
              <select
                className={inputClass}
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
              >
                <option value="">選択してください</option>
                {conditions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
        </FormSection>

        <div className="border-t border-background-200"></div>

        {/* カテゴリ固有情報 */}
        {category === "sneaker" && (
          <>
            <FormSection
              title="スニーカー詳細"
              errorCount={sectionErrors.sneaker}
              className="py-4"
            >
              <SneakerFields
                values={sneaker}
                accessories={sneakerAccessories}
                sizeError={errors.sneakerSize}
                onChange={updateSneaker}
                onAccessoriesChange={setSneakerAccessories}
              />
            </FormSection>
            <div className="border-t border-background-200"></div>
          </>
        )}

        {category === "jewelry" && (
          <>
            <FormSection
              title="ジュエリー詳細"
              errorCount={sectionErrors.jewelry}
              className="py-4"
            >
              <JewelryFields
                values={jewelry}
                typeError={errors.jewelryType}
                materialError={errors.jewelryMaterial}
                onChange={updateJewelry}
              />
            </FormSection>
            <div className="border-t border-background-200"></div>
          </>
        )}

        {category === "pokemon_card" && (
          <>
            <FormSection
              title="ポケモンカード詳細"
              errorCount={sectionErrors.pokemon}
              className="py-4"
            >
              <PokemonCardFields
                values={pokemonCard}
                nameError={errors.pokemonCardName}
                languageError={errors.pokemonCardLanguage}
                graderError={errors.pokemonCardGrader}
                gradeError={errors.pokemonCardGrade}
                conditionError={errors.pokemonCardCondition}
                onChange={(patch) => {
                  setPokemonCard((prev) => ({ ...prev, ...patch }));
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.pokemonCardName;
                    delete next.pokemonCardLanguage;
                    delete next.pokemonCardGrader;
                    delete next.pokemonCardGrade;
                    delete next.pokemonCardCondition;
                    return next;
                  });
                }}
              />
            </FormSection>
            <div className="border-t border-background-200"></div>
          </>
        )}

        {category === "other" && (
          <>
            <FormSection title="その他詳細" className="py-4">
              <p className="text-sm text-foreground-500">
                このカテゴリは共通の商品情報のみで登録できます。
              </p>
            </FormSection>
            <div className="border-t border-background-200"></div>
          </>
        )}

        {category === "apparel" && (
          <>
            <FormSection title="アパレル詳細" className="py-4">
              <p className="text-sm text-foreground-500">
                アパレルは共通の商品情報（ブランド・商品名・状態・価格・説明）で登録します。
                サイズや素材などは商品説明に記載してください。
              </p>
            </FormSection>
            <div className="border-t border-background-200"></div>
          </>
        )}

        {category === "fashion_goods" && (
          <>
            <FormSection title="ファッション小物詳細" className="py-4">
              <p className="text-sm text-foreground-500">
                ファッション小物は共通の商品情報（ブランド・商品名・状態・価格・説明）で登録します。
                素材や付属品などは商品説明に記載してください。
              </p>
            </FormSection>
            <div className="border-t border-background-200"></div>
          </>
        )}

        {/* 価格・在庫情報 */}
        <FormSection title="価格・在庫情報" className="py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="仕入価格 (円)">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-400">
                  ¥
                </span>
                <input
                  className={`${inputClass} pl-7`}
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={purchasePrice}
                  onChange={(e) =>
                    setPurchasePrice(e.target.value.replace(/[^0-9]/g, ""))
                  }
                />
              </div>
            </FormField>

            <FormField label="販売予定価格 (円)">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-foreground-400">
                  ¥
                </span>
                <input
                  className={`${inputClass} pl-7`}
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={sellPrice}
                  onChange={(e) => handleSellPriceChange(e.target.value)}
                />
              </div>
            </FormField>
          </div>
          <div className="mt-4">
            <FormField label="保管場所">
              <input
                className={inputClass}
                type="text"
                placeholder="例：倉庫 A-3"
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
              />
            </FormField>
          </div>
        </FormSection>

        <div className="border-t border-background-200"></div>

        {/* 商品説明・備考 */}
        <FormSection title="商品説明・備考" className="py-4">
          <div className="flex flex-col gap-4">
            <FormField
              label="商品説明"
              badge="販売用"
              badgeColor="primary"
              hintAlign="right"
              hint={`${description.length} / 1000 文字`}
            >
              <textarea
                className={`${inputClass} min-h-[112px] resize-y`}
                placeholder="商品の特徴や状態、購入時期などを入力してください"
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </FormField>

            <FormField
              label="備考"
              badge="社内用"
              badgeColor="secondary"
              hintAlign="right"
              hint={`${memo.length} / 500 文字`}
            >
              <textarea
                className={`${inputClass} min-h-[96px] resize-y`}
                placeholder="社内共有したい補足情報があれば入力してください"
                maxLength={500}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </FormField>
          </div>
        </FormSection>

        <div className="border-t border-background-200"></div>

        {/* 公開・Square連携 */}
        <FormSection title="公開・Square連携" className="py-4">
          <PublishSquareOptions
            publishChecked={publishOn}
            squareChecked={squareOn}
            disabled={isSubmitting}
            onPublishChange={handlePublishChange}
            onSquareChange={handleSquareChange}
          />
        </FormSection>

        {/* 登録ボタン */}
        <div className="pt-6 pb-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <i className="ri-loader-4-line animate-spin h-4 w-4 flex items-center justify-center"></i>
                登録中...
              </>
            ) : (
              <>
                <i className="ri-check-double-line h-4 w-4 flex items-center justify-center"></i>
                商品を登録
              </>
            )}
          </button>
          {isSubmitting && progressSteps.length > 0 && (
            <div className="mt-3">
              <RegisterProgress
                steps={progressSteps}
                currentIndex={progressIndex}
              />
            </div>
          )}
          {submitError && (
            <SaveStatusMessage tone="error" text={submitError} className="mt-3" />
          )}
          <p className="mt-2 text-center text-xs text-foreground-400">
            入力内容を確認してから登録してください
          </p>
        </div>
      </main>

      {/* AI候補の上書き確認モーダル */}
      {isApplyConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-background-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <i className="ri-error-warning-line w-5 h-5 flex items-center justify-center text-accent-600"></i>
              <h3 className="text-base font-semibold text-foreground-950">
                入力内容の上書き確認
              </h3>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-foreground-700">
              すでに入力されている項目があります。AI生成の候補を反映すると、
              該当する項目が上書きされます。よろしいですか？
            </p>
            <p className="mt-2 text-[11px] text-foreground-500">
              価格欄は未入力のときだけAI概算を自動入力します。入力済みの価格は変更しません。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsApplyConfirmOpen(false)}
                className="cursor-pointer whitespace-nowrap rounded-lg border border-background-300 bg-background-50 px-4 py-2 text-sm font-medium text-foreground-700 transition-colors hover:bg-background-100"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={applyCandidate}
                className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
              >
                <i className="ri-arrow-down-line w-4 h-4 flex items-center justify-center"></i>
                反映する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 完了モーダル */}
      {completion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 text-center">
            <span
              className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
                completion.type === "success"
                  ? "bg-primary-50 text-primary-600"
                  : completion.type === "partial"
                    ? "bg-amber-50 text-amber-600"
                    : "bg-red-50 text-red-600"
              }`}
            >
              <i
                className={`text-3xl ${
                  completion.type === "success"
                    ? "ri-check-line"
                    : "ri-error-warning-line"
                }`}
              ></i>
            </span>
            <h3 className="mt-4 text-lg font-semibold text-foreground-950">
              {completion.title}
            </h3>
            {productId && (
              <p className="mt-2 text-sm font-semibold text-foreground-700">
                商品ID：{productId}
              </p>
            )}
            <p className="mt-2 text-sm leading-relaxed text-foreground-500">
              {completion.message}
            </p>

            {completion.checkoutUrl && (
              <div className="mt-4 rounded-lg border border-background-200 bg-background-50 p-3 text-left">
                <p className="text-xs font-semibold text-foreground-700">
                  決済リンク生成済み
                </p>
                {completion.paymentLinkId && (
                  <p className="mt-1 text-xs text-foreground-500">
                    Payment Link ID：{" "}
                    <span className="break-all font-mono text-foreground-900">
                      {completion.paymentLinkId}
                    </span>
                  </p>
                )}
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    readOnly
                    value={completion.checkoutUrl}
                    className="min-w-0 flex-1 rounded-lg border border-background-300 bg-white px-3 py-2 font-mono text-xs text-foreground-900"
                  />
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyCheckoutUrl(completion.checkoutUrl ?? "")
                      }
                      className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 bg-background-50 px-3 py-2 text-xs font-medium text-foreground-700 transition-colors hover:bg-background-100"
                    >
                      <i className="ri-file-copy-line w-4 h-4 flex items-center justify-center"></i>
                      コピー
                    </button>
                    <a
                      href={completion.checkoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-600"
                    >
                      <i className="ri-external-link-line w-4 h-4 flex items-center justify-center"></i>
                      新しいタブで開く
                    </a>
                  </div>
                </div>
                {checkoutCopyFeedback && (
                  <p className="mt-1 text-xs font-medium text-primary-700">
                    {checkoutCopyFeedback}
                  </p>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2">
              {completion.type === "success" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setCompletion(null)}
                    className="flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
                  >
                    <i className="ri-edit-line w-4 h-4 flex items-center justify-center"></i>
                    この商品を編集して再確定する
                  </button>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {productId && (
                      <Link
                        to={`/products/${productId}`}
                        className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-primary-300 bg-primary-50 px-4 py-2.5 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
                      >
                        <i className="ri-article-line w-4 h-4 flex items-center justify-center"></i>
                        商品詳細を見る
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={resetForm}
                      className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-background-300 bg-background-50 px-4 py-2.5 text-sm font-semibold text-foreground-700 transition-colors hover:bg-background-100"
                    >
                      <i className="ri-add-line w-4 h-4 flex items-center justify-center"></i>
                      別の商品を登録
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row">
                  {productId && (
                    <Link
                      to={`/products/${productId}`}
                      className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-primary-300 bg-primary-50 px-4 py-2.5 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
                    >
                      <i className="ri-article-line w-4 h-4 flex items-center justify-center"></i>
                      商品詳細を見る
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => setCompletion(null)}
                    className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-background-100 px-4 py-2.5 text-sm font-semibold text-foreground-700 transition-colors hover:bg-background-200"
                  >
                    閉じる
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}