// === Imports corrects ===
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5'; // ou @expo/vector-icons

// Ton service API
import { documentsAPI } from '../../services/api';

// Si tu as un fichier de styles (recommandé) :
// import s from './styles';   // ou le chemin correct

// Sinon, on crée les styles directement ici (solution rapide)

const handleUpload = async (form, setUploaded, navigation) => {
  if (!form?.case) {
    Alert.alert('Missing Case', 'Please select a related case.');
    return;
  }

  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/msword', 
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
             'image/*'],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return;
    }

    const file = result.assets[0];
    setUploaded(true);

    await documentsAPI.upload(file, form.case);

    Alert.alert('Success', 'Document uploaded successfully!', [
      { text: 'OK', onPress: () => navigation?.goBack() }
    ]);
  } catch (err) {
    console.error(err);
    Alert.alert('Upload Failed', err?.message || 'An unknown error occurred');
  }
};
// ==================== Composant exemple ====================
const UploadButton = ({ form, setUploaded, navigation }: any) => {
  return (
    <TouchableOpacity 
      style={styles.btnPrimary} 
      onPress={() => handleUpload(form, setUploaded, navigation)}
      activeOpacity={0.8}
    >
      <FontAwesome5 name="upload" size={14} color="#fff" />
      <Text style={styles.btnPrimaryText}>Upload Document</Text>
    </TouchableOpacity>
  );
};

// Styles (à mettre en bas du fichier)
const styles = StyleSheet.create({
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF', // ou ta couleur primaire
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 10,
  },
  btnPrimaryText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 15,
  },
});

export default UploadButton;   // ou ton composant principal