import os
from PIL import Image, ImageDraw
import numpy as np

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public", "samples")

def create_board_base(w=900, h=900, mask_col=(20, 75, 45)):
    img = Image.new("RGB", (w, h), mask_col)
    np.random.seed(42)
    noise = (np.random.normal(0, 3, (h, w, 3))).astype(np.int16)
    arr = np.clip(np.array(img, dtype=np.int16) + noise, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr)
    draw = ImageDraw.Draw(img)
    
    # 4 Corner mounting holes
    for cx, cy in [(45, 45), (w - 45, 45), (45, h - 45), (w - 45, h - 45)]:
        draw.ellipse([cx - 24, cy - 24, cx + 24, cy + 24], fill=(195, 170, 95), outline=(215, 190, 110), width=2)
        draw.ellipse([cx - 16, cy - 16, cx + 16, cy + 16], fill=(12, 12, 12))
    
    # Ground plane copper fill hatch pattern
    for y in range(80, h - 80, 20):
        draw.line([(80, y), (w - 80, y)], fill=(28, 90, 54), width=1)
    for x in range(80, w - 80, 20):
        draw.line([(x, 80), (x, h - 80)], fill=(28, 90, 54), width=1)
    
    return img, draw

def generate_sample_clean_1():
    img, draw = create_board_base(900, 900, (18, 70, 42))
    cx, cy = 450, 450
    draw.rectangle([cx - 120, cy - 120, cx + 120, cy + 120], fill=(22, 22, 24), outline=(45, 45, 50), width=2)
    draw.ellipse([cx - 100, cy - 100, cx - 88, cy - 88], fill=(60, 60, 65))
    draw.text((cx - 65, cy - 10), "STM32F405", fill=(160, 160, 165))
    draw.text((cx - 50, cy + 10), "ARM CORTEX", fill=(130, 130, 135))
    
    copper = (210, 155, 60)
    gold_pad = (215, 185, 95)
    via_col = (190, 160, 85)
    
    for i in range(-90, 100, 15):
        draw.rectangle([cx + i - 4, cy - 145, cx + i + 4, cy - 122], fill=gold_pad)
        draw.line([(cx + i, cy - 145), (cx + i, cy - 200), (cx + i * 2, cy - 280)], fill=copper, width=3)
        draw.ellipse([cx + i * 2 - 6, cy - 280 - 6, cx + i * 2 + 6, cy - 280 + 6], fill=via_col)
        draw.ellipse([cx + i * 2 - 2, cy - 280 - 2, cx + i * 2 + 2, cy - 280 + 2], fill=(15, 15, 15))
        
        draw.rectangle([cx + i - 4, cy + 122, cx + i + 4, cy + 145], fill=gold_pad)
        draw.line([(cx + i, cy + 145), (cx + i, cy + 200), (cx + i * 2, cy + 280)], fill=copper, width=3)
        draw.ellipse([cx + i * 2 - 6, cy + 280 - 6, cx + i * 2 + 6, cy + 280 + 6], fill=via_col)
        draw.ellipse([cx + i * 2 - 2, cy + 280 - 2, cx + i * 2 + 2, cy + 280 + 2], fill=(15, 15, 15))

    draw.line([(100, 100), (800, 100)], fill=(240, 240, 240), width=2)
    draw.text((110, 110), "BOARD REV: 3.2-A", fill=(240, 240, 240))
    draw.text((110, 126), "TRACE IMPEDANCE: 50 OHM", fill=(220, 220, 220))
    return img

def generate_sample_clean_2():
    img, draw = create_board_base(900, 900, (15, 62, 38))
    copper_bus = (218, 160, 65)
    draw.rectangle([140, 180, 760, 220], fill=copper_bus)
    draw.rectangle([140, 680, 760, 720], fill=copper_bus)
    
    for x in range(180, 740, 55):
        draw.rectangle([x - 14, 230, x - 5, 255], fill=(215, 215, 220))
        draw.rectangle([x - 5, 230, x + 5, 255], fill=(140, 105, 75))
        draw.rectangle([x + 5, 230, x + 14, 255], fill=(215, 215, 220))
        draw.line([(x, 220), (x, 230)], fill=copper_bus, width=4)
        draw.line([(x, 255), (x, 275)], fill=copper_bus, width=3)
        draw.ellipse([x - 5, 275 - 5, x + 5, 275 + 5], fill=(200, 175, 90))
        draw.ellipse([x - 2, 275 - 2, x + 2, 275 + 2], fill=(15, 15, 15))
    
    rx, ry = 450, 450
    draw.rectangle([rx - 60, ry - 40, rx + 60, ry + 40], fill=(25, 25, 27))
    draw.text((rx - 45, ry - 8), "LM1117-3.3", fill=(170, 170, 175))
    
    draw.text((150, 150), "+3.3V POWER DISTRIBUTION", fill=(240, 240, 240))
    draw.text((150, 740), "GND BUS PLANE", fill=(240, 240, 240))
    return img

def generate_sample_defect_1():
    img, draw = create_board_base(900, 900, (18, 68, 40))
    cx, cy = 450, 450
    draw.rectangle([cx - 110, cy - 110, cx + 110, cy + 110], fill=(22, 22, 24))
    draw.text((cx - 50, cy - 8), "DSP-TMS320", fill=(160, 160, 165))
    
    gold_pad = (215, 185, 95)
    copper = (210, 155, 60)
    via_col = (195, 168, 92)
    
    for i in range(-80, 90, 16):
        draw.rectangle([cx + i - 5, cy - 135, cx + i + 5, cy - 112], fill=gold_pad)
        draw.line([(cx + i, cy - 135), (cx + i * 2, cy - 250)], fill=copper, width=3)
        
        # Missing hole at index -48
        if i in (-48, 16, 48):
            draw.ellipse([cx + i * 2 - 8, cy - 250 - 8, cx + i * 2 + 8, cy - 250 + 8], fill=via_col)
        else:
            draw.ellipse([cx + i * 2 - 8, cy - 250 - 8, cx + i * 2 + 8, cy - 250 + 8], fill=via_col)
            draw.ellipse([cx + i * 2 - 3, cy - 250 - 3, cx + i * 2 + 3, cy - 250 + 3], fill=(15, 15, 15))
            
        draw.rectangle([cx + i - 5, cy + 112, cx + i + 5, cy + 135], fill=gold_pad)
        draw.line([(cx + i, cy + 135), (cx + i * 2, cy + 250)], fill=copper, width=3)
        if i in (-32, 32):
            draw.ellipse([cx + i * 2 - 8, cy + 250 - 8, cx + i * 2 + 8, cy + 250 + 8], fill=via_col)
        else:
            draw.ellipse([cx + i * 2 - 8, cy + 250 - 8, cx + i * 2 + 8, cy + 250 + 8], fill=via_col)
            draw.ellipse([cx + i * 2 - 3, cy + 250 - 3, cx + i * 2 + 3, cy + 250 + 3], fill=(15, 15, 15))

    draw.text((120, 120), "SIGNAL BUS CONTROLLER — REV 4.1", fill=(240, 240, 240))
    return img

def generate_sample_defect_2():
    img, draw = create_board_base(900, 900, (18, 68, 40))
    cx, cy = 450, 450
    draw.rectangle([cx - 110, cy - 110, cx + 110, cy + 110], fill=(22, 22, 24))
    draw.text((cx - 50, cy - 8), "FPGA-ICE40", fill=(160, 160, 165))
    
    gold_pad = (215, 185, 95)
    copper = (210, 155, 60)
    via_col = (195, 168, 92)
    
    for i in range(-80, 90, 16):
        draw.rectangle([cx + i - 5, cy - 135, cx + i + 5, cy - 112], fill=gold_pad)
        draw.line([(cx + i, cy - 135), (cx + i * 2, cy - 250)], fill=copper, width=3)
        
        draw.rectangle([cx + i - 5, cy + 112, cx + i + 5, cy + 135], fill=gold_pad)
        draw.line([(cx + i, cy + 135), (cx + i * 2, cy + 250)], fill=copper, width=3)
        
        if i in (-48, 0):
            # Missing hole
            draw.ellipse([cx + i * 2 - 8, cy + 250 - 8, cx + i * 2 + 8, cy + 250 + 8], fill=via_col)
        else:
            draw.ellipse([cx + i * 2 - 8, cy + 250 - 8, cx + i * 2 + 8, cy + 250 + 8], fill=via_col)
            draw.ellipse([cx + i * 2 - 3, cy + 250 - 3, cx + i * 2 + 3, cy + 250 + 3], fill=(15, 15, 15))

    draw.text((120, 120), "HIGH-DENSITY BGA ESCAPE ROUTING", fill=(240, 240, 240))
    return img

# Save all 4 samples
clean1 = generate_sample_clean_1()
clean1.save(os.path.join(OUTPUT_DIR, "sample_clean_1.jpg"), "JPEG", quality=95)

clean2 = generate_sample_clean_2()
clean2.save(os.path.join(OUTPUT_DIR, "sample_clean_2.jpg"), "JPEG", quality=95)

defect1 = generate_sample_defect_1()
defect1.save(os.path.join(OUTPUT_DIR, "sample_defect_1.jpg"), "JPEG", quality=95)

defect2 = generate_sample_defect_2()
defect2.save(os.path.join(OUTPUT_DIR, "sample_defect_2.jpg"), "JPEG", quality=95)

print("Regenerated 4 samples in public/samples")
