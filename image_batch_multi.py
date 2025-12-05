"""
ImageBatchMulti - A dynamic input version of ImageBatch.

This node allows batching multiple images with a dynamically growing number of inputs.
When you connect an image to an input, a new input slot automatically appears.
"""

import torch
import comfy.utils
from comfy_api.latest import io
from comfy_api.latest import _io


class ImageBatchMulti(io.ComfyNode):
    """
    Batch multiple images together with dynamic inputs.
    
    Connect images to the input slots - new slots will automatically appear
    as you connect more images. All connected images will be batched together
    into a single image tensor.
    """
    
    @classmethod
    def define_schema(cls):
        # Create autogrow template for IMAGE inputs
        # prefix="image" creates inputs named image0, image1, image2, etc.
        # min=1 means at least one input is always shown
        # max=16 allows up to 16 images to be batched
        template = _io.Autogrow.TemplatePrefix(
            input=io.Image.Input("image"),
            prefix="image",
            min=1,
            max=16
        )
        
        return io.Schema(
            node_id="ImageBatchMulti",
            display_name="Batch Images (Multi)",
            description="Batch multiple images with dynamic inputs. New inputs appear as you connect images.",
            category="image",
            inputs=[
                _io.Autogrow.Input("images", template=template)
            ],
            outputs=[
                io.Image.Output(display_name="IMAGE"),
            ],
        )

    @classmethod
    def execute(cls, images: _io.Autogrow.Type) -> io.NodeOutput:
        """
        Batch all connected images together.
        
        Args:
            images: Dictionary of connected images {input_name: image_tensor}
        
        Returns:
            Single batched image tensor
        """
        # Get all connected images (filter out None values)
        image_list = [img for img in images.values() if img is not None]
        
        if len(image_list) == 0:
            raise ValueError("At least one image must be connected")
        
        if len(image_list) == 1:
            return io.NodeOutput(image_list[0])
        
        # Start with the first image as reference for dimensions
        result = image_list[0]
        
        # Batch all subsequent images
        for img in image_list[1:]:
            result = cls._batch_images(result, img)
        
        return io.NodeOutput(result)
    
    @staticmethod
    def _batch_images(image1: torch.Tensor, image2: torch.Tensor) -> torch.Tensor:
        """
        Batch two images together, handling dimension mismatches.
        
        This matches the original ImageBatch behavior:
        - Pads channels if they differ (RGB vs RGBA)
        - Upscales the second image if dimensions differ
        """
        # Handle channel mismatch (e.g., RGB vs RGBA)
        if image1.shape[-1] != image2.shape[-1]:
            if image1.shape[-1] > image2.shape[-1]:
                # Pad image2 with alpha channel
                image2 = torch.nn.functional.pad(
                    image2, (0, 1), mode='constant', value=1.0
                )
            else:
                # Pad image1 with alpha channel
                image1 = torch.nn.functional.pad(
                    image1, (0, 1), mode='constant', value=1.0
                )
        
        # Handle spatial dimension mismatch
        if image1.shape[1:3] != image2.shape[1:3]:
            # Upscale image2 to match image1's dimensions
            image2 = comfy.utils.common_upscale(
                image2.movedim(-1, 1),  # BHWC -> BCHW
                image1.shape[2],  # width
                image1.shape[1],  # height
                "bilinear",
                "center"
            ).movedim(1, -1)  # BCHW -> BHWC
        
        # Concatenate along batch dimension
        return torch.cat((image1, image2), dim=0)

