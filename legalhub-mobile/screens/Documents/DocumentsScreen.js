import React from "react";
import { View } from "react-native";
import { Button, List } from "react-native-paper";

export default function DocumentsScreen({ navigation }) {
  return (
    <View style={{ padding: 20 }}>
      <List.Item title="Contract.pdf" description="Uploaded 10 Feb 2026" />
      <List.Item title="Evidence.docx" description="Uploaded 12 Feb 2026" />

      <Button
        mode="contained"
        style={{ marginTop: 20 }}
        onPress={() => navigation.navigate("UploadDocument")}
      >
        Upload Document
      </Button>
    </View>
  );
}