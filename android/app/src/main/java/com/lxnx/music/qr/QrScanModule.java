package com.lxnx.music.qr;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.BaseActivityEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;

/**
 * 二维码能力：
 * - scan()      打开 ZXing 取景框实时扫码（做法同 跨屏输入 项目）
 * - decode(uri) 把相册里的图片交给 MLKit 离线解码，作为扫不出来时的兜底
 */
public class QrScanModule extends ReactContextBaseJavaModule {

  private static final String NAME = "LXQrScan";

  private Promise pendingScan;

  private final ActivityEventListener activityListener = new BaseActivityEventListener() {
    @Override
    public void onActivityResult(Activity activity, int requestCode, int resultCode, Intent data) {
      if (requestCode != IntentIntegrator.REQUEST_CODE) return;
      Promise promise = pendingScan;
      pendingScan = null;
      if (promise == null) return;

      IntentResult result = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
      String contents = result == null ? null : result.getContents();
      promise.resolve(contents == null ? "" : contents);
    }
  };

  public QrScanModule(ReactApplicationContext context) {
    super(context);
    context.addActivityEventListener(activityListener);
  }

  @Override
  public String getName() {
    return NAME;
  }

  /**
   * 打开相机取景框扫二维码。
   *
   * @return 二维码文本；用户取消或没扫到返回空串
   */
  @ReactMethod
  public void scan(Promise promise) {
    Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.reject("no_activity", "当前没有可用的界面");
      return;
    }
    if (pendingScan != null) {
      promise.reject("busy", "上一次扫码还没结束");
      return;
    }

    pendingScan = promise;
    try {
      IntentIntegrator integrator = new IntentIntegrator(activity);
      integrator.setDesiredBarcodeFormats(IntentIntegrator.QR_CODE);
      integrator.setPrompt("把手表上的二维码放进框内");
      integrator.setBeepEnabled(false);
      integrator.setOrientationLocked(true);
      integrator.initiateScan();
    } catch (Exception e) {
      pendingScan = null;
      promise.reject("scan_error", "打不开相机：" + e.getMessage());
    }
  }

  /**
   * 从图片里识别二维码。
   *
   * @param uri 图片地址，支持 file:// 与 content://
   * @return 解码出的文本；没识别到二维码时返回空串
   */
  @ReactMethod
  public void decode(String uri, Promise promise) {
    InputImage image;
    try {
      image = InputImage.fromFilePath(getReactApplicationContext(), Uri.parse(uri));
    } catch (Exception e) {
      promise.reject("decode_error", "无法读取图片：" + e.getMessage());
      return;
    }

    BarcodeScannerOptions options = new BarcodeScannerOptions.Builder()
        .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
        .build();
    BarcodeScanner scanner = BarcodeScanning.getClient(options);

    scanner.process(image)
        .addOnSuccessListener(barcodes -> {
          scanner.close();
          if (barcodes == null || barcodes.isEmpty()) {
            promise.resolve("");
            return;
          }
          String value = barcodes.get(0).getRawValue();
          promise.resolve(value == null ? "" : value);
        })
        .addOnFailureListener(e -> {
          scanner.close();
          promise.reject("decode_failed", e);
        });
  }
}
