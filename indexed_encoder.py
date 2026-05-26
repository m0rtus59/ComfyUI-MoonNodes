from typing import NamedTuple
import torch
from nodes import CLIPTextEncode

# Standard ComfyUI CLIP special tokens
SPECIAL_TOKENS = {"start": 49406, "end": 49407, "pad": 49407}

class CLIPTokens(NamedTuple):
    # Now stores tuples of (token_id, weight) instead of raw integers
    clip_l_tokens: list[tuple[int, float]]
    clip_g_tokens: list[tuple[int, float]] | None = None

    @classmethod
    def empty_tokens(cls):
        return CLIPTokens(clip_l_tokens=[], clip_g_tokens=[])

    @property
    def length(self) -> int:
        return len(self.clip_l_tokens)

    def __add__(self, other):
        clip_g = None
        if self.clip_g_tokens is not None or other.clip_g_tokens is not None:
            self_g = self.clip_g_tokens if self.clip_g_tokens is not None else []
            other_g = other.clip_g_tokens if other.clip_g_tokens is not None else []
            clip_g = list(self_g) + list(other_g)
            
        return CLIPTokens(
            clip_l_tokens=list(self.clip_l_tokens) + list(other.clip_l_tokens),
            clip_g_tokens=clip_g,
        )

    @staticmethod
    def _get_77_tokens(subprompt_inds: list[tuple[int, float]], pad_token: int) -> list[tuple[int, float]]:
        # Bounds tokens to max 75 and pads to 77, applying default 1.0 weight to special tokens
        result = (
            [(SPECIAL_TOKENS["start"], 1.0)]
            + subprompt_inds[:75]
            + [(SPECIAL_TOKENS["end"], 1.0)]
            + [(pad_token, 1.0)] * 75
        )
        return result[:77]

    def clamp_to_77_tokens(self):
        # Clip L pads with 49407, OpenCLIP G (SDXL) strictly pads with 0
        return CLIPTokens(
            clip_l_tokens=self._get_77_tokens(self.clip_l_tokens, pad_token=49407),
            clip_g_tokens=(
                self._get_77_tokens(self.clip_g_tokens, pad_token=0) if self.clip_g_tokens is not None else None
            ),
        )

def greedy_partition(items: list[CLIPTokens], max_sum: int) -> list[list[CLIPTokens]]:
    bags = []
    current_bag = []
    current_sum = 0

    for item in items:
        num = item.length
        if current_sum + num > max_sum:
            if current_bag:
                bags.append(current_bag)
            current_bag = [item]
            current_sum = num
        else:
            current_bag.append(item)
            current_sum += num

    if current_bag:
        bags.append(current_bag)

    return bags

class MoonIndexedEncoder:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "clip": ("CLIP",),
                "text": ("STRING", {"multiline": True, "default": ""}),
                "greedy": ("BOOLEAN", {"default": False}),
            }
        }

    RETURN_TYPES = ("CONDITIONING",)
    OUTPUT_IS_LIST = (True,) 
    FUNCTION = "encode_indexed"
    CATEGORY = "MoonNodes"

    def encode_indexed(self, clip, text, greedy):
        parts = [p.strip() for p in text.split("BREAK")]
        conditioning_list = []
        
        # --- Internal Helper Functions for Tokenizing and Encoding ---
        def convert_comfy_tokens(comfy_tokens) -> list[tuple[int, float]]:
            if not comfy_tokens or not comfy_tokens[0]:
                return []
            tokens = comfy_tokens[0] # List of (token_id, weight) tuples
            
            # Extract just the IDs to locate the end token
            token_ids = [t for t, _ in tokens]
            if SPECIAL_TOKENS["end"] in token_ids:
                end_idx = token_ids.index(SPECIAL_TOKENS["end"])
                return tokens[1 : end_idx] # Slice preserves original weight tuples
            return tokens[1:] 

        def convert_to_comfy_tokens(tokens: CLIPTokens):
            # Passes original weights directly back to the CLIP encoder
            out = {"l": [tokens.clip_l_tokens]}
            if tokens.clip_g_tokens is not None:
                out["g"] = [tokens.clip_g_tokens]
            return out

        def tokenize_func(t_str: str) -> CLIPTokens:
            tokens = clip.tokenize(t_str)
            clip_l = convert_comfy_tokens(tokens.get("l", []))
            clip_g = convert_comfy_tokens(tokens.get("g", [])) if "g" in tokens else None
            return CLIPTokens(clip_l_tokens=clip_l, clip_g_tokens=clip_g)

        def encode_func(tokens: CLIPTokens):
            comfy_dict = convert_to_comfy_tokens(tokens)
            cond, pooled = clip.encode_from_tokens(comfy_dict, return_pooled=True)
            return cond, pooled
        # -------------------------------------------------------------

        for part in parts:
            if not part:
                # Flag as empty so the sampler can skip it
                conditioning_list.append(None)
                continue
            
            if greedy:
                # Split by commas for greedy packing
                subprompts = [s.strip() for s in part.split(",") if s.strip()]
                
                if not subprompts:
                    conditioning_list.append(None)
                    continue

                # Space Bias (BOS Spacing)
                processed_subprompts = []
                for idx, sub in enumerate(subprompts):
                    if idx == 0:
                        processed_subprompts.append(sub)
                    else:
                        processed_subprompts.append(" " + sub)

                # 1. Tokenize processed subprompts (preserving weight values)
                suffix_targets = [tokenize_func(sub) for sub in processed_subprompts]
                
                # 2. Re-inject Comma Tokens (ID 267) with standard weight 1.0
                for i in range(len(suffix_targets) - 1):
                    has_g = suffix_targets[i].clip_g_tokens is not None
                    comma_token = CLIPTokens(
                        clip_l_tokens=[(267, 1.0)], 
                        clip_g_tokens=[(267, 1.0)] if has_g else None
                    )
                    suffix_targets[i] = suffix_targets[i] + comma_token

                # 3. Partition them into bags
                partitioned_bags = greedy_partition(suffix_targets, max_sum=75)
                
                # 4. Create clamped 77-token targets with correct pad values
                targets = [
                    sum(bag, CLIPTokens.empty_tokens()).clamp_to_77_tokens()
                    for bag in partitioned_bags
                ]
                
                # 5. Pass them through CLIP and merge the tensors
                encoded_embeds = [encode_func(t) for t in targets]
                conds_merged = torch.cat([embed[0] for embed in encoded_embeds], dim=1)
                poolers_merged = encoded_embeds[0][1]
                
                conditioning_list.append([[conds_merged, {"pooled_output": poolers_merged}]])
            else:
                # Standard Simple ComfyUI Encoding
                encoded = CLIPTextEncode().encode(clip, part)[0]
                conditioning_list.append(encoded)
                    
        return (conditioning_list,)